// AI 服务 IPC 处理器（主进程 Node fetch，无 CORS，密钥不进渲染进程网络层）。
//
// 通道：
//   ai:test-connection  请求 { baseUrl, apiKey } -> { ok, status?, message }
//   ai:chat-stream      发起 OpenAI 兼容流式对话，SSE 块经事件转发给渲染进程
//   ai:chat-abort       中止指定 requestId 的上游请求（ipcRenderer.send）
//   ai:web-search       Brave Search API 联网搜索 -> { ok, results?, message? }
//
// 事件（主进程 -> 渲染进程）：
//   ai:chat-chunk  { requestId, chunk }  一段原始 SSE 事件（data: {...}\n\n）
//   ai:chat-end    { requestId }
//   ai:chat-error  { requestId, message }

import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'

export interface TestConnectionResult {
  ok: boolean
  status?: number
  message: string
}

export interface ChatStreamRequest {
  requestId: string
  baseUrl: string
  apiKey?: string
  body: Record<string, unknown>
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

const TIMEOUT_MS = 10_000

/** 进行中的对话请求：requestId -> AbortController（供 ai:chat-abort 中止上游 fetch） */
const activeChatAborters = new Map<string, AbortController>()

function sendTo(event: IpcMainInvokeEvent | IpcMainEvent, channel: string, payload: unknown): void {
  if (!event.sender.isDestroyed()) event.sender.send(channel, payload)
}

function describeHttpError(status: number, raw: string): string {
  if (status === 401 || status === 403) return '认证失败，请检查 API Key'
  let detail = ''
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } }
    detail = parsed?.error?.message ?? ''
  } catch {
    /* 非 JSON 错误体 */
  }
  return detail || `请求失败（HTTP ${status}）`
}

function describeNetworkError(e: unknown): string {
  const err = e as { name?: string; cause?: { code?: string; message?: string }; message?: string }
  if (err.name === 'AbortError') return `请求超时（${TIMEOUT_MS / 1000}s）`
  const code = err.cause?.code
  if (
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'EHOSTUNREACH' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT'
  ) {
    return `无法连接服务器（${code}），请检查 Base URL`
  }
  return err.cause?.message ?? err.message ?? '连接失败'
}

export function registerAiService(): void {
  ipcMain.handle(
    'ai:test-connection',
    async (_e, payload: { baseUrl?: string; apiKey?: string }): Promise<TestConnectionResult> => {
      const baseUrl = (payload.baseUrl ?? '').trim().replace(/\/+$/, '')
      const apiKey = (payload.apiKey ?? '').trim()

      if (!baseUrl) {
        return { ok: false, message: '请先填写 Base URL' }
      }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
      try {
        const res = await fetch(`${baseUrl}/models`, {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
          signal: controller.signal,
        })

        if (res.ok) {
          const data = (await res.json().catch(() => null)) as { data?: unknown[] } | null
          const count = Array.isArray(data?.data) ? data.data.length : undefined
          return {
            ok: true,
            status: res.status,
            message: count !== undefined ? `联通成功，发现 ${count} 个模型` : '联通成功',
          }
        }

        if (res.status === 401 || res.status === 403) {
          return { ok: false, status: res.status, message: '认证失败，请检查 API Key' }
        }
        return { ok: false, status: res.status, message: `请求失败（HTTP ${res.status}）` }
      } catch (e) {
        return { ok: false, message: describeNetworkError(e) }
      } finally {
        clearTimeout(timer)
      }
    }
  )

  // ===== 流式对话 =====
  // 在主进程发起 POST {baseUrl}/chat/completions（stream: true），
  // 按 SSE 事件边界（\n\n）切块后经 ai:chat-chunk 转发；渲染进程负责拼回流。
  ipcMain.handle('ai:chat-stream', async (event, payload: ChatStreamRequest) => {
    const requestId = payload?.requestId
    const baseUrl = (payload?.baseUrl ?? '').trim().replace(/\/+$/, '')
    const apiKey = payload?.apiKey?.trim() || undefined
    const body = payload?.body

    if (!requestId || !baseUrl || !body) {
      return { ok: false, message: '请求参数不完整' }
    }

    const controller = new AbortController()
    activeChatAborters.set(requestId, controller)
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const raw = await res.text().catch(() => '')
        const message = describeHttpError(res.status, raw)
        sendTo(event, 'ai:chat-error', { requestId, message })
        return { ok: false, message }
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let sep = buffer.indexOf('\n\n')
        while (sep >= 0) {
          const chunk = buffer.slice(0, sep + 2)
          buffer = buffer.slice(sep + 2)
          sendTo(event, 'ai:chat-chunk', { requestId, chunk })
          sep = buffer.indexOf('\n\n')
        }
      }
      // 兜底：流以单个 \n 结尾等边界情况
      if (buffer.trim()) sendTo(event, 'ai:chat-chunk', { requestId, chunk: buffer })
      sendTo(event, 'ai:chat-end', { requestId })
      return { ok: true }
    } catch (e) {
      const err = e as { name?: string }
      if (err.name === 'AbortError') {
        return { ok: false, aborted: true, message: '已中止' }
      }
      const message = describeNetworkError(e)
      sendTo(event, 'ai:chat-error', { requestId, message })
      return { ok: false, message }
    } finally {
      activeChatAborters.delete(requestId)
    }
  })

  ipcMain.on('ai:chat-abort', (_e, payload: { requestId?: string }) => {
    const requestId = payload?.requestId
    if (!requestId) return
    activeChatAborters.get(requestId)?.abort()
    activeChatAborters.delete(requestId)
  })

  // ===== 联网搜索（Brave Search API）=====
  ipcMain.handle(
    'ai:web-search',
    async (_e, payload: { query?: string; apiKey?: string; count?: number }): Promise<WebSearchResponse> => {
      const query = (payload?.query ?? '').trim()
      const apiKey = (payload?.apiKey ?? '').trim()

      if (!query) return { ok: false, message: '搜索关键词不能为空' }
      if (!apiKey) return { ok: false, message: '请先在设置中填写 Brave Search API Key' }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
      try {
        const url = new URL('https://api.search.brave.com/res/v1/web/search')
        url.searchParams.set('q', query)
        url.searchParams.set('count', String(payload?.count ?? 6))
        const res = await fetch(url, {
          headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
          signal: controller.signal,
        })

        if (!res.ok) {
          const message =
            res.status === 401 || res.status === 403
              ? '搜索 API Key 无效或已过期'
              : `搜索失败（HTTP ${res.status}）`
          return { ok: false, status: res.status, message }
        }

        const data = (await res.json().catch(() => null)) as {
          web?: { results?: { title?: string; url?: string; description?: string }[] }
        } | null
        const results = (data?.web?.results ?? []).map((r) => ({
          title: r.title ?? '',
          url: r.url ?? '',
          description: r.description ?? '',
        }))
        return { ok: true, results }
      } catch (e) {
        return { ok: false, message: describeNetworkError(e) }
      } finally {
        clearTimeout(timer)
      }
    }
  )
}
