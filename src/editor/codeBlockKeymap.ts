import { $prose } from '@milkdown/utils'
import { keymap } from '@milkdown/prose/keymap'
import { TextSelection } from '@milkdown/prose/state'
import type { EditorState, Transaction } from '@milkdown/prose/state'

/**
 * code_block 内的 Tab 缩进行为。
 *
 * 问题：ProseMirror 默认不拦截 Tab，浏览器会把焦点切到下一个可聚焦元素——
 * 代码块工具条上的「语言选择 / 复制 / 删除」按钮都是可聚焦的，于是光标在代码里
 * 按 Tab 会跳到语言下拉，而不是缩进。
 *
 * 这里给 code_block 加一个 keymap：
 * - Tab        折叠/单行：在光标处插入一个 \t（有选区则替换为 \t）；
 *              多行：给选区内每一行行首插入一个 \t（块缩进）。
 * - Shift-Tab  给选区内每一行去掉行首一个 \t；没有 \t 则去掉至多 tab-size 个前导空格（块退格）。
 *
 * 与 CSS `tab-size: 2` 配合：插入的 \t 会按 2 列对齐到下一个制表位，符合编辑器直觉。
 * 仅当选区位于 code_block 内才接管（返回 true），其余情况返回 false，让 Milkdown 的
 * 列表缩进（Tab sink / Shift-Tab lift）等其它键位继续生效。
 */

const TAB = '\t'
/** 与 .prose pre { tab-size: 2 } 保持一致：Shift-Tab 退格时按此宽度吃掉前导空格。 */
const TAB_SIZE = 2

function inCodeBlock(state: EditorState): boolean {
  return state.selection.$from.parent.type.name === 'code_block'
}

/**
 * 选区 [relFrom, relTo] 跨越的行的行首相对偏移。
 * - 总是包含 relFrom 所在行；
 * - to 恰好落在某行行首（列 0）时，那行不算进来（光标只是贴着它，没选中内容）。
 */
function lineStarts(text: string, relFrom: number, relTo: number): number[] {
  const starts: number[] = []
  // relFrom 所在行的行首：往前找上一个换行
  let ls = 0
  for (let k = 0; k < relFrom; k++) if (text[k] === '\n') ls = k + 1
  starts.push(ls)
  // 之后到 relTo 之前的每个换行开启一行
  for (let k = ls; k < relTo; k++) {
    if (text[k] === '\n') {
      const next = k + 1
      if (next < relTo) starts.push(next)
    }
  }
  return starts
}

/** Tab：缩进。 */
function indent(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (!inCodeBlock(state)) return false
  const { selection } = state
  const $from = selection.$from
  const parent = $from.parent
  const textStart = $from.before($from.depth) + 1
  const text = parent.textContent
  const from = Math.min(selection.from, selection.to)
  const to = Math.max(selection.from, selection.to)
  const relFrom = from - textStart
  const relTo = to - textStart
  const multiline = text.slice(relFrom, relTo).includes('\n')

  if (!dispatch) return true
  const tr = state.tr

  if (!multiline) {
    // 折叠或单行：在光标处插入 \t（有选区则替换）
    tr.insertText(TAB, from, to)
    tr.setSelection(TextSelection.create(tr.doc, from + 1))
  } else {
    const starts = lineStarts(text, relFrom, relTo)
    // 从后往前插，保证前面的偏移不变
    for (let i = starts.length - 1; i >= 0; i--) {
      tr.insertText(TAB, textStart + starts[i])
    }
    // 选区平移：from 仅被第一行行首的 \t 顶后 1，to 被所有行首 \t 顶后 starts.length
    tr.setSelection(TextSelection.create(tr.doc, from + 1, to + starts.length))
  }

  tr.scrollIntoView()
  dispatch(tr)
  return true
}

/** Shift-Tab：退格（块退格）。 */
function outdent(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (!inCodeBlock(state)) return false
  const { selection } = state
  const $from = selection.$from
  const parent = $from.parent
  const textStart = $from.before($from.depth) + 1
  const text = parent.textContent
  const from = Math.min(selection.from, selection.to)
  const to = Math.max(selection.from, selection.to)
  const relFrom = from - textStart
  const relTo = to - textStart

  if (!dispatch) return true
  const tr = state.tr

  const starts = lineStarts(text, relFrom, relTo)
  let removedBeforeFrom = 0
  let removedBeforeTo = 0
  // 从后往前删，保证前面的偏移不变
  for (let i = starts.length - 1; i >= 0; i--) {
    const s = starts[i]
    let del = 0
    if (text[s] === '\t') {
      del = 1
    } else {
      let n = 0
      while (n < TAB_SIZE && text[s + n] === ' ') n++
      del = n
    }
    if (del > 0) tr.delete(textStart + s, textStart + s + del)
    if (s < relFrom) removedBeforeFrom += del
    if (s < relTo) removedBeforeTo += del
  }

  // 没有任何可退格的字符：不产生 transaction，避免无谓的 history 记录
  if (removedBeforeFrom === 0 && removedBeforeTo === 0) return true

  const newFrom = from - removedBeforeFrom
  let newTo = to - removedBeforeTo
  if (newTo < newFrom) newTo = newFrom
  tr.setSelection(TextSelection.create(tr.doc, newFrom, newTo))
  tr.scrollIntoView()
  dispatch(tr)
  return true
}

export const codeBlockTabKeymap = $prose(() =>
  keymap({
    Tab: indent,
    'Shift-Tab': outdent,
  }),
)
