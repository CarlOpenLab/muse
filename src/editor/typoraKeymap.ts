/**
 * Typora 式编辑器内快捷键 + 智能粘贴。
 *
 * - 段落/格式快捷键（⌘1-6、⌘0、⌘K、⌘⌥Q/O/U/C/T/B…）转发为 `muse:format` 窗口事件，
 *   由 MilkdownCore 监听并经 runFormat 执行（prose 层拿不到 milkdown ctx，事件桥接）。
 * - Tab / ⇧Tab：表格内跳格，列表内缩进/反缩进（直接用 prosemirror 命令，不经 ctx）。
 * - 智能粘贴：选中有文字时粘贴 URL → 直接变成链接（Typora 行为）。
 */
import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { sinkListItem, liftListItem } from '@milkdown/prose/schema-list'
import { goToNextCell } from '@milkdown/prose/tables'
import type { EditorView } from '@milkdown/prose/view'

export const typoraKeymapKey = new PluginKey('muse-typora-keymap')

const FORMAT_EVENTS: Record<string, string> = {
  'Mod-1': 'heading-1',
  'Mod-2': 'heading-2',
  'Mod-3': 'heading-3',
  'Mod-4': 'heading-4',
  'Mod-5': 'heading-5',
  'Mod-6': 'heading-6',
  'Mod-0': 'paragraph',
  'Mod-=': 'increase-heading',
  'Mod--': 'decrease-heading',
  'Mod-Alt-q': 'quote',
  'Mod-Alt-o': 'ordered-list',
  'Mod-Alt-u': 'bullet-list',
  'Mod-Shift-x': 'task-list',
  'Mod-Alt-c': 'code-fence',
  'Mod-Alt-b': 'math-block',
  'Mod-Alt-t': 'table',
  'Mod-Shift-`': 'inline-code',
  'Ctrl-Shift-`': 'strike',
  'Alt-Shift-5': 'strike',
  'Mod-\\': 'clear-format',
  'Mod-]': 'sink-list',
  'Mod-[': 'lift-list',
}

/** 对外发格式动作事件（MilkdownCore 消费） */
function emit(action: string): boolean {
  window.dispatchEvent(new CustomEvent('muse:format', { detail: action }))
  return true
}

const URL_RE = /^(https?:\/\/|mailto:)\S+$/i

function inListType($from: { node(d: number): { type: { name: string } }; depth: number }): string | null {
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name
    if (name === 'bullet_list' || name === 'ordered_list') return name
  }
  return null
}

function inNodeType($from: { node(d: number): { type: { name: string } }; depth: number }, name: string): boolean {
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === name) return true
  }
  return false
}

export const typoraKeymap = $prose(
  () =>
    new Plugin({
      key: typoraKeymapKey,
      props: {
        handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
          const key = event.key === 'Tab' ? 'Tab' : event.key.toLowerCase()
          let combo = ''
          if (event.metaKey || event.ctrlKey) combo += 'Mod-'
          else if (key === 'Tab') combo = ''
          if (event.ctrlKey && !event.metaKey) combo = 'Ctrl-'
          if (event.altKey) combo += 'Alt-'
          if (event.shiftKey) combo += 'Shift-'
          const comboKey = combo + key

          // Tab / Shift-Tab：表格跳格 > 列表缩进 > 放行（代码块由专用插件处理）
          if (key === 'Tab') {
            const { state } = view
            const { $from } = state.selection
            if (inNodeType($from, 'code_block')) return false
            if (inNodeType($from, 'table')) {
              return goToNextCell(event.shiftKey ? -1 : 1)(state, view.dispatch, view)
            }
            if (inListType($from)) {
              return event.shiftKey
                ? liftListItem(state.schema.nodes.list_item)(state, view.dispatch, view)
                : sinkListItem(state.schema.nodes.list_item)(state, view.dispatch, view)
            }
            return false
          }

          const action = FORMAT_EVENTS[comboKey]
          if (action) {
            event.preventDefault()
            return emit(action)
          }
          if (comboKey === 'Mod-k') {
            event.preventDefault()
            window.dispatchEvent(new CustomEvent('muse:request-link'))
            return true
          }
          if (comboKey === 'Mod-Ctrl-i' || comboKey === 'Ctrl-Mod-i') {
            event.preventDefault()
            window.dispatchEvent(new CustomEvent('muse:request-image'))
            return true
          }
          return false
        },
        handlePaste(view: EditorView, event: ClipboardEvent): boolean {
          const text = event.clipboardData?.getData('text/plain') ?? ''
          // Typora 行为：选中有文字时粘贴纯 URL → 选中文字变成链接
          if (text && URL_RE.test(text.trim())) {
            const { state } = view
            const { from, to, empty } = state.selection
            if (!empty && to > from) {
              const linkType = state.schema.marks.link
              if (linkType) {
                event.preventDefault()
                view.dispatch(state.tr.addMark(from, to, linkType.create({ href: text.trim() })))
                return true
              }
            }
          }
          return false
        },
      },
    })
)
