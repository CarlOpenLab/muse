/**
 * 真实请求通道：渲染进程 -> 主进程（Node fetch）-> 供应商 API。
 *
 * 复用 x-sdk 的 SSE 管线：本模块提供一个自定义 `fetch`（XRequest 的 fetch 选项），
 * 把请求体交给主进程发起（避免 CORS、网络请求不出主进程），
 * 主进程按 SSE 事件边界转发原始块，这里再拼回 ReadableStream Response，
 * x-sdk 的 SSE 解析 / 流式 onUpdate 逻辑完全不变。
 *
 * 未配置供应商时回退到本地 mock（演示模式）。
 */
import type { XModelMessage, XModelParams, XModelResponse, XRequestOptions } from '@antdv-next/x-sdk'
import { mockChatFetch } from './mockProvider'

export interface ChatConnection {
  baseUrl: string
  apiKey?: string
}

export interface WebSearchResultItem {
  title: string
  url: string
  description: string
}

export interface WebSearchResponse {
  ok: boolean
  results?: WebSearchResultItem[]
  status?: number
  message?: string
}

/** 当前活跃供应商连接（由 useChat 随 settings 同步） */
let connection: ChatConnection | null = null

/** 本次请求要附加的联网搜索上下文（system 消息）；取走后即清空 */
let pendingSearchContext: string | null = null

export function setChatConnection(next: ChatConnection | null): void {
  connection = next ? { ...next, baseUrl: next.baseUrl.replace(/\/+$/, '') } : null
}

/** 发送前由 useChat 注入：联网搜索结果转成的 system 上下文 */
export function setPendingSearchContext(context: string | null): void {
  pendingSearchContext = context
}

export function ipcChatFetch(
  _baseURL: Parameters<typeof fetch>[0],
  options: XRequestOptions<XModelParams, XModelResponse>
): Promise<Response> {
  // 取出并清空搜索上下文（即使走 mock 也不残留，避免下次真实请求误注入）
  const searchContext = pendingSearchContext
  pendingSearchContext = null

  // 未配置供应商 -> 本地演示模式
  if (!connection) return mockChatFetch(_baseURL, options)

  // 解析 x-sdk 组装好的请求体，注入搜索上下文
  let body: { messages?: XModelMessage[]; [key: string]: unknown }
  try {
    body = JSON.parse(String((options as { body?: string }).body ?? '{}')) as typeof body
  } catch {
    body = {}
  }
  if (searchContext && Array.isArray(body.messages)) {
    body.messages = [{ role: 'system', content: searchContext }, ...body.messages]
  }

  const requestId = `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let settled = false
      let offs: ((() => void) | undefined)[] = []
      const settle = (): void => {
        if (settled) return
        settled = true
        offs.forEach((off) => off?.())
      }

      offs = [
        window.muse?.on('ai:chat-chunk', (payload) => {
          const e = payload as { requestId: string; chunk: string }
          if (e?.requestId !== requestId) return
          controller.enqueue(encoder.encode(e.chunk))
        }),
        window.muse?.on('ai:chat-end', (payload) => {
          const e = payload as { requestId: string }
          if (e?.requestId !== requestId) return
          settle()
          controller.close()
        }),
        window.muse?.on('ai:chat-error', (payload) => {
          const e = payload as { requestId: string; message: string }
          if (e?.requestId !== requestId) return
          settle()
          controller.error(new Error(e?.message ?? '请求失败'))
        }),
      ]

      options.signal?.addEventListener('abort', () => {
        settle()
        window.muse?.send('ai:chat-abort', { requestId })
        controller.error(new DOMException('已停止', 'AbortError'))
      })

      window.muse
        ?.invoke('ai:chat-stream', {
          requestId,
          baseUrl: connection?.baseUrl,
          apiKey: connection?.apiKey,
          body,
        })
        .catch(() => {
          if (settled) return
          settle()
          controller.error(new Error('请求通道不可用'))
        })
    },
    cancel() {
      window.muse?.send('ai:chat-abort', { requestId })
    },
  })

  return Promise.resolve(
    new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    })
  )
}
