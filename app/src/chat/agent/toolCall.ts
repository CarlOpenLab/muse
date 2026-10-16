/**
 * 工具调用的解析与流式累加。
 *
 * 从 provider 里拆出来，修掉两个真实 bug：
 * 1. 旧代码 `JSON.parse(tc.arguments)` 写在 try 之外 —— 参数不完整时整条流直接报错。
 * 2. tool_call 增量用 `+=` 累加 id/name —— 端点若每条增量都带完整 id/name 就会重复拼接。
 *
 * 纯函数，无副作用，可用 `node --test` 直接测。
 */

export interface ToolCallAccumulator {
  id: string
  name: string
  arguments: string
}

export interface ToolCallDelta {
  index?: number
  id?: string
  function?: { name?: string; arguments?: string }
  /** 兼容部分端点把 name/arguments 摊平在顶层的写法 */
  name?: string
  arguments?: string
}

export type ParsedArgs =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; error: string }

/** 安全解析工具参数：空串 → {}；非对象 → 报错。永不抛异常。 */
export function parseToolArguments(raw: unknown): ParsedArgs {
  if (raw == null) return { ok: true, args: {} }
  if (typeof raw === 'object') return { ok: true, args: raw as Record<string, unknown> }
  const text = String(raw).trim()
  if (!text) return { ok: true, args: {} }
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: '参数必须是 JSON 对象' }
    }
    return { ok: true, args: value as Record<string, unknown> }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `参数不是合法 JSON：${msg}` }
  }
}

/** 把一条流式 tool_call 增量并入累加器（按 index 归位）。 */
export function applyToolCallDelta(
  accs: ToolCallAccumulator[],
  deltas: ToolCallDelta[] | undefined
): void {
  if (!deltas) return
  for (const d of deltas) {
    const idx = typeof d.index === 'number' && d.index >= 0 ? d.index : 0
    let acc = accs[idx]
    if (!acc) {
      acc = { id: '', name: '', arguments: '' }
      accs[idx] = acc
    }
    if (d.id && !acc.id) acc.id = d.id
    const name = d.function?.name ?? d.name
    if (name && !acc.name) acc.name = name
    const chunk = d.function?.arguments ?? d.arguments
    if (typeof chunk === 'string' && chunk) acc.arguments += chunk
  }
}

/** 出站校验：id / name 缺失的调用不执行，直接回一条错误结果给模型。 */
export function validateToolCall(acc: ToolCallAccumulator): string | null {
  if (!acc.name) return '工具调用缺少 name，已忽略'
  if (!acc.id) return '工具调用缺少 id，已忽略'
  return null
}

/** 清掉累加器数组里的空位（增量流可能留下稀疏下标）。 */
export function compactToolCalls(accs: ToolCallAccumulator[] | undefined): ToolCallAccumulator[] {
  return (accs ?? []).filter((a): a is ToolCallAccumulator => !!a && !!(a.name || a.arguments || a.id))
}