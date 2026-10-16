/**
 * 纯函数 diff：给「AI 改动提议」的确认卡片算行级 + 行内词级差异。
 *
 * 刻意不依赖 Vue / ProseMirror / 编辑器状态，只吃两段字符串，
 * 这样可以用 `node --test` 直接测（见 __tests__/diff.test.ts）。
 */

export type DiffLineType = 'same' | 'add' | 'del'

export interface DiffSegment {
  type: 'same' | 'add' | 'del'
  text: string
}

export interface DiffLine {
  type: DiffLineType
  text: string
  /** 原文行号（1 起；新增行为 null） */
  oldNo: number | null
  /** 新文行号（1 起；删除行为 null） */
  newNo: number | null
  /** 配对后的行内词级差异（仅相邻的删除/新增行成对时存在） */
  segments?: DiffSegment[]
}

export interface DiffSummary {
  added: number
  removed: number
  unchanged: number
  changed: boolean
}

/** LCS 规模上限：超过则退化为「整段替换」，避免大文档卡死渲染线程。 */
const MAX_LCS_CELLS = 4_000_000

function splitLines(text: string): string[] {
  return text === '' ? [] : text.split('\n')
}

interface Op {
  type: DiffLineType
  text: string
}

/** LCS 行对齐，输出 same/add/del 的线性操作序列。 */
function lcsOps(a: string[], b: string[]): Op[] {
  const n = a.length
  const m = b.length
  const ops: Op[] = []
  if (n * m > MAX_LCS_CELLS) {
    for (const line of a) ops.push({ type: 'del', text: line })
    for (const line of b) ops.push({ type: 'add', text: line })
    return ops
  }
  // dp[i][j] = LCS(a[i:], b[j:])
  const dp: Uint32Array[] = new Array(n + 1)
  for (let i = 0; i <= n; i++) dp[i] = new Uint32Array(m + 1)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'same', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', text: a[i] })
      i++
    } else {
      ops.push({ type: 'add', text: b[j] })
      j++
    }
  }
  while (i < n) ops.push({ type: 'del', text: a[i++] })
  while (j < m) ops.push({ type: 'add', text: b[j++] })
  return ops
}

/** 按「空白 / 非空白」切 token，保留原文本可无损拼回。 */
function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((t) => t !== '')
}

/** 行内词级 diff：返回同一段内容的 same / del / add 片段。 */
export function diffWords(oldText: string, newText: string): DiffSegment[] {
  if (oldText === newText) return oldText ? [{ type: 'same', text: oldText }] : []
  const a = tokenize(oldText)
  const b = tokenize(newText)
  const n = a.length
  const m = b.length
  const out: DiffSegment[] = []
  const push = (type: DiffSegment['type'], text: string) => {
    if (!text) return
    const last = out[out.length - 1]
    if (last && last.type === type) last.text += text
    else out.push({ type, text })
  }
  if (n * m > MAX_LCS_CELLS) {
    push('del', oldText)
    push('add', newText)
    return out
  }
  const dp: Uint32Array[] = new Array(n + 1)
  for (let i = 0; i <= n; i++) dp[i] = new Uint32Array(m + 1)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', a[i])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push('del', a[i])
      i++
    } else {
      push('add', b[j])
      j++
    }
  }
  while (i < n) push('del', a[i++])
  while (j < m) push('add', b[j++])
  return out
}

/** 行级 diff；相邻的删除/新增行会配对算出行内词级 segments。 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const ops = lcsOps(splitLines(oldText), splitLines(newText))
  const out: DiffLine[] = []
  let oldNo = 0
  let newNo = 0
  for (const op of ops) {
    if (op.type === 'same') {
      out.push({ type: 'same', text: op.text, oldNo: ++oldNo, newNo: ++newNo })
    } else if (op.type === 'del') {
      out.push({ type: 'del', text: op.text, oldNo: ++oldNo, newNo: null })
    } else {
      out.push({ type: 'add', text: op.text, oldNo: null, newNo: ++newNo })
    }
  }
  // 配对相邻的 del 段与紧随其后的 add 段，补行内差异
  for (let k = 0; k < out.length; k++) {
    if (out[k].type !== 'del') continue
    let dEnd = k
    while (dEnd < out.length && out[dEnd].type === 'del') dEnd++
    let aEnd = dEnd
    while (aEnd < out.length && out[aEnd].type === 'add') aEnd++
    if (dEnd > k && aEnd > dEnd) {
      const pairs = Math.min(dEnd - k, aEnd - dEnd)
      for (let p = 0; p < pairs; p++) {
        const del = out[k + p]
        const add = out[dEnd + p]
        const segs = diffWords(del.text, add.text)
        if (segs.length) {
          del.segments = segs.filter((s) => s.type !== 'add')
          add.segments = segs.filter((s) => s.type !== 'del')
        }
      }
    }
    k = aEnd - 1
  }
  return out
}

export function summarizeDiff(lines: DiffLine[]): DiffSummary {
  let added = 0
  let removed = 0
  let unchanged = 0
  for (const l of lines) {
    if (l.type === 'add') added++
    else if (l.type === 'del') removed++
    else unchanged++
  }
  return { added, removed, unchanged, changed: added > 0 || removed > 0 }
}