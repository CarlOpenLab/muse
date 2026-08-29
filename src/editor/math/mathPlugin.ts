/**
 * 数学公式支持（Typora：$…$ 行内、$$…$$ 块级）。
 *
 * - remark-math 负责把 $…$ / $$…$$ 解析为 mdast 节点、序列化回 markdown
 * - katex 负责渲染（displayMode 区分块级/行内）
 * - NodeView 提供点击编辑：点击公式出现输入框，Enter/失焦提交、Esc 取消
 *   （atom 节点不可直接打字，插入的空公式块会自动进入编辑态）
 */
import { $nodeSchema, $remark, $inputRule, $view } from '@milkdown/utils'
import { InputRule } from '@milkdown/prose/inputrules'
import type { Node as PMNode } from '@milkdown/prose/model'
import type { EditorView, NodeView } from '@milkdown/prose/view'
import katex from 'katex'
import remarkMath from 'remark-math'

export const remarkMathPlugin = $remark('muse-remark-math', () => remarkMath)

const KATEX_OPTS = { throwOnError: false, strict: false } as const

function renderKatex(target: HTMLElement, latex: string, displayMode: boolean): void {
  target.textContent = ''
  if (!latex.trim()) return
  try {
    katex.render(latex, target, { ...KATEX_OPTS, displayMode })
  } catch {
    target.textContent = latex
  }
}

// ---------- 行内公式 ----------
export const mathInlineSchema = $nodeSchema('math_inline', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  attrs: { value: { default: '' } },
  parseDOM: [
    {
      tag: 'span[data-type="math_inline"]',
      getAttrs: (el) => ({ value: (el as HTMLElement).dataset.value ?? '' }),
    },
  ],
  toDOM: (node) => {
    const span = document.createElement('span')
    span.dataset.type = 'math_inline'
    span.dataset.value = String(node.attrs.value ?? '')
    renderKatex(span, String(node.attrs.value ?? ''), false)
    return span
  },
  parseMarkdown: {
    match: ({ type }) => type === 'inlineMath',
    runner: (state, node, type) => {
      state.openNode(type, { value: String(node.value ?? '') }).closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_inline',
    runner: (state, node) => {
      state.addNode('inlineMath', undefined, String(node.attrs.value ?? ''))
    },
  },
}))

// ---------- 块级公式 ----------
export const mathBlockSchema = $nodeSchema('math_block', () => ({
  group: 'block',
  atom: true,
  defining: true,
  isolating: true,
  attrs: { value: { default: '' } },
  parseDOM: [
    {
      tag: 'div[data-type="math_block"]',
      getAttrs: (el) => ({ value: (el as HTMLElement).dataset.value ?? '' }),
    },
  ],
  toDOM: (node) => {
    const div = document.createElement('div')
    div.dataset.type = 'math_block'
    div.dataset.value = String(node.attrs.value ?? '')
    renderKatex(div, String(node.attrs.value ?? ''), true)
    return div
  },
  parseMarkdown: {
    match: ({ type }) => type === 'math',
    runner: (state, node, type) => {
      state.openNode(type, { value: String(node.value ?? '') }).closeNode()
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'math_block',
    runner: (state, node) => {
      state.addNode('math', undefined, String(node.attrs.value ?? ''))
    },
  },
}))

// ---------- 输入规则 ----------
// 行内：$x$ 光标离开第二个 $ 时生效
export const mathInlineInputRule = $inputRule(
  () =>
    new InputRule(/\$([^$\n]+)\$$/, (state, match, start, end) => {
      const value = match[1] ?? ''
      if (!value.trim()) return null
      const node = state.schema.nodes.math_inline?.create({ value: value.trim() })
      if (!node) return null
      return state.tr.replaceWith(start, end, node)
    })
)

// 块级：空行输入 $$ 回车 → 转为公式块
export const mathBlockInputRule = $inputRule(
  () =>
    new InputRule(/^\$\$\s$/, (state, _match, start, end) => {
      const block = state.schema.nodes.math_block
      if (!block) return null
      return state.tr.delete(start, end).setBlockType(start, start, block, { value: '' })
    })
)

// ---------- NodeView：点击编辑 ----------
type PosGetter = () => number | undefined

function attachEditor(
  host: HTMLElement,
  view: EditorView,
  getPos: PosGetter,
  initial: string,
  displayMode: boolean,
  autoFocus: boolean
): void {
  const input = document.createElement('textarea')
  input.value = initial
  input.className = 'muse-math-editor'
  input.rows = displayMode ? 3 : 1
  input.spellcheck = false
  host.textContent = ''
  host.appendChild(input)
  host.classList.add('muse-math-editing')
  if (autoFocus) {
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  }

  let done = false
  const commit = (): void => {
    if (done) return
    done = true
    const pos = getPos()
    if (pos != null) view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { value: input.value.trim() }))
    view.focus()
  }
  const cancel = (): void => {
    if (done) return
    done = true
    view.focus()
  }
  input.addEventListener('blur', commit)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (!displayMode || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
    e.stopPropagation() // 按键不要漏进编辑器（撤销/快捷键等）
  })
}

function makeMathView(displayMode: boolean): (node: PMNode, view: EditorView, getPos: PosGetter) => NodeView {
  return (node, view, getPos) => {
    const host = displayMode ? document.createElement('div') : document.createElement('span')
    host.dataset.type = displayMode ? 'math_block' : 'math_inline'
    host.dataset.value = String(node.attrs.value ?? '')
    host.classList.add(displayMode ? 'muse-math-block' : 'muse-math-inline')
    renderKatex(host, String(node.attrs.value ?? ''), displayMode)

    // 空公式块（⌘⌥B 插入）自动进入编辑态
    const maybeAutoEdit = (): void => {
      if (!String(node.attrs.value ?? '').trim()) {
        attachEditor(host, view, getPos, '', displayMode, true)
      }
    }
    if (!String(node.attrs.value ?? '').trim()) setTimeout(maybeAutoEdit, 0)

    host.addEventListener('click', (e) => {
      e.stopPropagation()
      attachEditor(host, view, getPos, String(node.attrs.value ?? ''), displayMode, false)
    })

    return {
      dom: host,
      update(updated: PMNode): boolean {
        if (updated.type.name !== (displayMode ? 'math_block' : 'math_inline')) return false
        node = updated
        host.dataset.value = String(updated.attrs.value ?? '')
        renderKatex(host, String(updated.attrs.value ?? ''), displayMode)
        return true
      },
      ignoreMutation: () => true,
      stopEvent: () => false,
    }
  }
}

export const mathInlineView = $view(mathInlineSchema.node, () => makeMathView(false))
export const mathBlockView = $view(mathBlockSchema.node, () => makeMathView(true))

/** 一次 .use 全部接入（$Remark 是二元组，flat 摊平成插件列表） */
export const museMath = [
  remarkMathPlugin,
  mathInlineSchema,
  mathBlockSchema,
  mathInlineInputRule,
  mathBlockInputRule,
  mathInlineView,
  mathBlockView,
].flat()
