/**
 * 真实请求通道：渲染进程 -> 主进程（Node fetch）-> 供应商 API。
 *
 * 复用 x-sdk 的 SSE 管线：本模块提供一个自定义 `fetch`（XRequest 的 fetch 选项），
 * 把请求体交给主进程发起（避免 CORS、网络请求不出主进程），
 * 主进程按 SSE 事件边界转发原始块，这里解析后重建 SSE 流回给 x-sdk。
 *
 * ## Agent 模式（工具调用 + 思考链）
 * 请求体带 `tools` 时进入 agent loop：逐轮请求模型，流中解析 tool_calls，
 * 在渲染进程执行文档编辑工具（dispatchEditorTool → MilkdownCore 直接改文档），
 * 把工具结果作为 tool 消息带回下一轮，直到模型不再调用工具。
 *
 * ## 思考链（reasoning_content）
 * 所有请求（含普通聊天）都会解析 reasoning_content delta，经 chainStore
 * 实时写入，UI 用 @antdv-next/x 的 ThoughtChain 组件展示「深度思考」节点。
 * 工具调用同样写入 chainStore（loading → success|error）。
 *
 * 输出流只保留各轮的 content delta（OpenAI SSE 格式），x-sdk / UI 层无感。
 */
import type { XModelMessage, XModelParams, XModelResponse, XRequestOptions } from '@antdv-next/x-sdk'
import { mockChatFetch } from './mockProvider'
import { dispatchEditorTool } from '../composables/useEditorControl'
import { pushChainEntry, updateChainEntry } from './chainStore'
import { TOOL_LABEL, toolArgsSummary, type ToolResult } from './editorTools'
import { buildSystemMessages } from './agent/prompt'
import {
  applyToolCallDelta,
  compactToolCalls,
  parseToolArguments,
  validateToolCall,
} from './agent/toolCall'

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

/** 本次请求要附加的当前文档上下文（system 消息）；取走后即清空 */
let pendingDocContext: string | null = null

/** 本次请求要附加的选中文本上下文（system 消息）；取走后即清空 */
let pendingSelectionContext: string | null = null

export function setChatConnection(next: ChatConnection | null): void {
  connection = next ? { ...next, baseUrl: next.baseUrl.replace(/\/+$/, '') } : null
}

/** 发送前由 useChat 注入：联网搜索结果转成的 system 上下文 */
export function setPendingSearchContext(context: string | null): void {
  pendingSearchContext = context
}

/** 发送前由 ChatPanel 注入：当前文档 markdown 转成的 system 上下文 */
export function setPendingDocContext(context: string | null): void {
  pendingDocContext = context
}

/** 发送前由 ChatPanel 注入：当前选中的文本（供润色 / 扩写 / 翻译 / 总结等直接编辑操作） */
export function setPendingSelectionContext(context: string | null): void {
  pendingSelectionContext = context
}

// ===== SSE 解析 =====

const MAX_ROUNDS = 6

interface ToolCallDelta {
  index?: number
  id?: string
  type?: string
  function?: { name?: string; arguments?: string }
}

export interface AgentToolCall {
  id: string
  name: string
  arguments: string
}

export interface AgentRoundResult {
  /** 含 content 的原始 SSE 事件文本（原样转发给 x-sdk） */
  contentEvents: string[]
  /** 本轮累积的正文文本（写入历史时与 tool_calls 一起保留，避免模型的话丢失） */
  content: string
  toolCalls: AgentToolCall[]
  /** 本轮累积的思考文本（增量，供思考链流式更新） */
  thinking: string
  error?: string
}

interface AgentOptions {
  baseUrl: string
  apiKey?: string
  body: Record<string, unknown>
  signal?: AbortSignal
  /** 本轮请求是否携带工具声明（决定 agent loop / 降级） */
  hasTools: boolean
}

/** 增量解析 SSE 文本：提取 content 事件、tool_calls 增量与思考增量 */
export function processSseText(
  buf: { s: string },
  raw: string,
  acc: AgentRoundResult,
  onThinking?: (delta: string) => void
): void {
  buf.s += raw
  let sep = buf.s.indexOf('\n\n')
  while (sep >= 0) {
    const block = buf.s.slice(0, sep)
    buf.s = buf.s.slice(sep + 2)
    const dataLine = block.split('\n').find((l) => l.startsWith('data:'))
    if (dataLine) {
      const data = dataLine.slice(5).trim()
      if (data && data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data) as {
            choices?: {
              delta?: {
                content?: string | null
                reasoning_content?: string | null
                tool_calls?: ToolCallDelta[]
              }
            }[]
          }
          const delta = parsed.choices?.[0]?.delta
          if (!delta) continue
          if (delta.content) acc.contentEvents.push(`data: ${data}\n\n`)
          if (delta.content) acc.content += delta.content
          if (delta.reasoning_content) {
            acc.thinking += delta.reasoning_content
            onThinking?.(delta.reasoning_content)
          }
          if (delta.tool_calls?.length) applyToolCallDelta(acc.toolCalls, delta.tool_calls)
        } catch {
          /* 非 JSON 事件忽略 */
        }
      }
    }
    sep = buf.s.indexOf('\n\n')
  }
}

/** 真实连接：走主进程 IPC 读一轮 SSE */
function readIpcRound(
  requestId: string,
  baseUrl: string,
  apiKey: string | undefined,
  body: Record<string, unknown>,
  onThinking?: (delta: string) => void
): Promise<AgentRoundResult> {
  return new Promise((resolve) => {
    const acc: AgentRoundResult = { contentEvents: [], content: '', toolCalls: [], thinking: '' }
    const buf = { s: '' }
    let settled = false
    const done = (r: AgentRoundResult): void => {
      if (settled) return
      settled = true
      offs.forEach((off) => off?.())
      resolve(r)
    }

    const offs = [
      window.muse?.on('ai:chat-chunk', (payload) => {
        const e = payload as { requestId: string; chunk: string }
        if (e?.requestId !== requestId) return
        processSseText(buf, e.chunk, acc, onThinking)
      }),
      window.muse?.on('ai:chat-end', (payload) => {
        const e = payload as { requestId: string }
        if (e?.requestId !== requestId) return
        done(acc)
      }),
      window.muse?.on('ai:chat-error', (payload) => {
        const e = payload as { requestId: string; message: string }
        if (e?.requestId !== requestId) return
        done({ ...acc, error: e?.message ?? '请求失败' })
      }),
    ]

    window.muse
      ?.invoke('ai:chat-stream', { requestId, baseUrl, apiKey, body })
      .then((r) => {
        // 主进程在 abort 时只返回 { ok:false, aborted:true }，不发 chat-end/chat-error 事件，
        // 这里必须兜底 resolve，否则 readIpcRound 永久挂起（agent 模式停止生成会卡死）
        const res = r as { ok?: boolean; message?: string } | undefined
        if (res && res.ok === false) done({ ...acc, error: res.message ?? '请求已中止' })
      })
      .catch(() => {
        done({ ...acc, error: '请求通道不可用' })
      })
  })
}

/** Mock 连接：直接读 mockChatFetch 的流 */
async function readMockRound(body: Record<string, unknown>): Promise<AgentRoundResult> {
  const acc: AgentRoundResult = { contentEvents: [], content: '', toolCalls: [], thinking: '' }
  const buf = { s: '' }
  const res = await mockChatFetch('', { body: JSON.stringify(body) } as RequestInit)
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    processSseText(buf, decoder.decode(value, { stream: true }), acc)
  }
  return acc
}

const sseEncoder = new TextEncoder()

/** 工具调用 → 思考链节点（loading → success|error），返回执行结果 */
async function executeToolWithChain(tc: AgentToolCall): Promise<ToolResult> {
  const label = TOOL_LABEL[tc.name] ?? tc.name
  // 安全解析：参数不完整/非法时不再让整条流崩掉，而是回一条错误结果给模型
  const parsed = parseToolArguments(tc.arguments)
  const args = parsed.ok ? parsed.args : {}
  const summary = toolArgsSummary(tc.name, args)
  const key = pushChainEntry({
    kind: 'tool',
    status: 'loading',
    title: label,
    description: summary || (parsed.ok ? '执行中…' : parsed.error),
  })
  let tr: ToolResult
  if (!parsed.ok) {
    tr = { ok: false, message: `参数无法解析：${parsed.error}` }
  } else {
    try {
      tr = await dispatchEditorTool(tc.name, args)
    } catch (e) {
      tr = { ok: false, message: `工具执行失败：${e instanceof Error ? e.message : String(e)}` }
    }
  }
  updateChainEntry(key, {
    status: tr.ok ? 'success' : 'error',
    description: tr.ok ? tr.message : `失败：${tr.message}`,
  })
  return tr
}

/** 工具结果是否是一次「改动提议」（propose_edit 成功提交） */
function isProposalResult(tr: ToolResult): boolean {
  const data = tr.data as { status?: string } | undefined
  return !!data && data.status === 'proposed'
}

/**
 * 统一请求流：解析 → 转发 content → 思考链实时更新 → （有 tools 时）agent loop。
 * 无 tools 的普通聊天同样走这里（单轮），深度思考也能在思考链中展示。
 */
function createChatStream(opts: AgentOptions): ReadableStream<Uint8Array> {
  let cancelled = false
  let currentRequestId = ''
  const messages = [...(Array.isArray(opts.body.messages) ? opts.body.messages : [])] as XModelMessage[]

  // ===== 思考链：reasoning_content 流式累积成 think 节点 =====
  let thinkKey: string | null = null
  let thinkText = ''
  const ensureThinkNode = (): void => {
    if (!thinkKey) {
      thinkKey = pushChainEntry({ kind: 'think', status: 'loading', title: '深度思考' })
    }
  }
  const onThinkingDelta = (delta: string): void => {
    if (cancelled) return
    ensureThinkNode()
    thinkText += delta
    if (thinkKey) updateChainEntry(thinkKey, { content: thinkText })
  }

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const abortCurrent = (): void => {
        if (currentRequestId) window.muse?.send('ai:chat-abort', { requestId: currentRequestId })
      }
      const onAbort = (): void => {
        cancelled = true
        abortCurrent()
      }
      opts.signal?.addEventListener('abort', onAbort)

      try {
        let degraded = false
        // 记录循环是怎么结束的：自然收尾 / 已提交改动提议 / 轮次用尽
        let stopReason: 'natural' | 'proposed' | 'cap' = 'cap'
        for (let round = 1; round <= MAX_ROUNDS; round++) {
          if (cancelled) break
          currentRequestId = `agent_${Date.now().toString(36)}_${round}_${Math.random().toString(36).slice(2, 8)}`
          const roundBody: Record<string, unknown> = { ...opts.body, messages, stream: true }
          if (degraded) {
            // 降级：端点不支持工具调用时去掉 tools 重试同一轮（老模型兼容）
            delete roundBody.tools
            delete roundBody.tool_choice
          }

          const result = opts.baseUrl
            ? await readIpcRound(currentRequestId, opts.baseUrl, opts.apiKey, roundBody, onThinkingDelta)
            : await readMockRound(roundBody)

          if (cancelled) break
          if (result.error) {
            if (opts.hasTools && !degraded) {
              degraded = true
              continue
            }
            controller.error(new Error(result.error))
            return
          }

          // 转发本轮的 content（原样 SSE，x-sdk 无感）
          for (const ev of result.contentEvents) controller.enqueue(sseEncoder.encode(ev))

          // 工具调用：执行后把结果作为 tool 消息带回下一轮
          if (result.toolCalls.length) {
            const calls = compactToolCalls(result.toolCalls)
            const toolMsgs: XModelMessage[] = []
            let proposed = false
            for (const tc of calls) {
              const invalid = validateToolCall(tc)
              if (invalid) {
                toolMsgs.push({
                  role: 'tool',
                  type: 'tool',
                  tool_call_id: tc.id || `invalid_${toolMsgs.length}`,
                  content: JSON.stringify({ ok: false, message: invalid } as ToolResult),
                } as XModelMessage)
                continue
              }
              const tr = await executeToolWithChain(tc)
              if (isProposalResult(tr)) proposed = true
              // 带 type 字段：兼容要求消息显式带 type 的端点（如 Console Go），OpenAI 端点忽略未知字段
              toolMsgs.push({
                role: 'tool',
                type: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify(tr),
              } as XModelMessage)
            }
            messages.push(
              {
                role: 'assistant',
                type: 'assistant',
                // 保留本轮模型的正文：旧实现写死 null，把「我准备改这几处」这类说明丢掉了
                content: result.content || null,
                // OpenAI 规范：tool_calls 必须是嵌套结构 { id, type: 'function', function: { name, arguments } }
                tool_calls: calls.map((tc) => ({
                  id: tc.id,
                  type: 'function',
                  function: { name: tc.name, arguments: tc.arguments },
                })),
              } as unknown as XModelMessage,
              ...toolMsgs
            )
            // 保活：工具轮可能无文本，发空事件重置 x-sdk 的 streamTimeout 计时，避免慢模型下一轮被误判超时
            controller.enqueue(
              sseEncoder.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {} }] })}\n\n`)
            )
            // 已经提交改动提议：收尾等用户确认，不再空转后续轮次
            if (proposed) {
              stopReason = 'proposed'
              break
            }
            continue
          }
          stopReason = 'natural'
          break
        }
      } finally {
        opts.signal?.removeEventListener('abort', onAbort)
      }
      if (thinkKey) updateChainEntry(thinkKey, { status: 'success' })
      if (!cancelled) controller.enqueue(sseEncoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
    cancel() {
      cancelled = true
      if (thinkKey) updateChainEntry(thinkKey, { status: 'abort' })
      if (currentRequestId) window.muse?.send('ai:chat-abort', { requestId: currentRequestId })
    },
  })
}

// ===== 主入口 =====

export function ipcChatFetch(
  _baseURL: Parameters<typeof fetch>[0],
  options: XRequestOptions<XModelParams, XModelResponse>
): Promise<Response> {
  // 取出并清空上下文（即使走 mock 也不残留，避免下次真实请求误注入）
  const searchContext = pendingSearchContext
  pendingSearchContext = null
  const docContext = pendingDocContext
  pendingDocContext = null
  const selectionContext = pendingSelectionContext
  pendingSelectionContext = null

  // 解析 x-sdk 组装好的请求体，注入上下文
  let body: { messages?: XModelMessage[]; tools?: unknown[]; [key: string]: unknown }
  try {
    body = JSON.parse(String((options as { body?: string }).body ?? '{}')) as typeof body
  } catch {
    body = {}
  }
  if (Array.isArray(body.messages)) {
    const hasToolsEarly = Array.isArray(body.tools) && body.tools.length > 0
    // agent 提示词（带工具时）+ 文档 / 选区 / 搜索上下文
    const systems = buildSystemMessages(
      { doc: docContext, selection: selectionContext, search: searchContext },
      { withTools: hasToolsEarly }
    ) as XModelMessage[]
    if (systems.length) body.messages = [...systems, ...body.messages]
  }

  const hasTools = Array.isArray(body.tools) && body.tools.length > 0
  const baseUrl = connection?.baseUrl ?? ''
  const apiKey = connection?.apiKey
  const signal = options.signal ?? undefined

  // 统一走解析转发流（普通聊天单轮；带 tools 时 agent loop + 思考链）
  return Promise.resolve(
    new Response(
      createChatStream({ baseUrl, apiKey, body, signal, hasTools }),
      { status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } }
    )
  )
}
