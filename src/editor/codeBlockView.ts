import { $view } from '@milkdown/utils'
import { codeBlockSchema } from '@milkdown/preset-commonmark'
import type { NodeView } from '@milkdown/prose/view'
import type { Node as PMNode } from '@milkdown/prose/model'

/**
 * code_block 自定义 NodeView：在代码块右上角加一个语言输入框，支持即时改语言。
 *
 * 结构：`<div.code-block><div.code-lang-bar><input/></div><pre><code/></pre></div>`
 * - contentDOM 仍是 `<code>`，ProseMirror 管文本、Shiki inline decoration 照常上色；
 * - 语言条用 `<div>` 包裹（absolute），不随 `<pre>` 横向滚动；
 * - 语言输入即时 dispatch `setNodeAttribute`；`update()` 复用 DOM，输入过程不失焦
 *   （input 事件 -> 改 language attr -> ProseMirror 调 update -> input.value 已同步，不重置）；
 * - `stopEvent` 拦截输入框事件，避免方向键/退格影响代码内容与编辑器选区；
 * - `ignoreMutation` 仅忽略语言条子树，contentDOM 文本变化照常让 ProseMirror 处理。
 */
export const codeBlockView = $view(codeBlockSchema.node, () => (node, view, getPos) => {
  const dom = document.createElement('div')
  dom.classList.add('code-block')

  const bar = document.createElement('div')
  bar.className = 'code-lang-bar'
  bar.contentEditable = 'false'

  const input = document.createElement('input')
  input.className = 'code-lang-input'
  input.value = String(node.attrs.language ?? '')
  input.placeholder = '语言'
  input.spellcheck = false
  input.setAttribute('aria-label', '代码语言')
  input.addEventListener('input', () => {
    const pos = getPos()
    if (typeof pos !== 'number') return
    view.dispatch(view.state.tr.setNodeAttribute(pos, 'language', input.value))
  })
  input.addEventListener('keydown', (e) => {
    // 阻止按键冒泡到 ProseMirror（方向键/退格不应改代码内容或移动光标）
    e.stopPropagation()
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault()
      input.blur()
      view.focus()
    }
  })
  bar.appendChild(input)

  const pre = document.createElement('pre')
  const codeDOM = document.createElement('code')
  pre.appendChild(codeDOM)
  dom.appendChild(bar)
  dom.appendChild(pre)

  let current: PMNode = node

  return {
    dom,
    contentDOM: codeDOM,
    update(updated) {
      if (updated.type !== current.type) return false
      const lang = String(updated.attrs.language ?? '')
      if (input.value !== lang) input.value = lang
      current = updated
      return true
    },
    ignoreMutation(record) {
      // 仅忽略语言条子树的 mutation；contentDOM 文本变化必须交给 ProseMirror
      return bar.contains(record.target)
    },
    stopEvent(event) {
      // 输入框上的事件不冒泡到编辑器（否则点击 input 会移动 ProseMirror 选区）
      return event.target === input
    },
  } satisfies NodeView
})
