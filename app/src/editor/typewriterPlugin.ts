/**
 * 打字机模式（Typora F9）：光标竖向位置始终保持在滚动容器约 45% 高度处。
 * 监听选区变化（view.update），滚动容器 scrollTop 直接对齐（不进撤销栈、不改文档）。
 */
import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import { useViewMode } from '../composables/useViewMode'

export const typewriterKey = new PluginKey('muse-typewriter')

const CARET_ANCHOR = 0.45

function keepCaretCentered(view: EditorView): void {
  const container = view.dom.closest('.editor-scroll') as HTMLElement | null
  if (!container) return
  const caret = view.coordsAtPos(view.state.selection.from)
  const box = container.getBoundingClientRect()
  if (caret.top < box.top - 1 || caret.top > box.bottom + 1) return // 光标不在视口内（大纲跳转等）不拉扯
  const target = box.top + box.height * CARET_ANCHOR
  const delta = caret.top - target
  if (Math.abs(delta) > 1) container.scrollTop += delta
}

export const typewriterPlugin = $prose(
  () =>
    new Plugin({
      key: typewriterKey,
      view(view: EditorView) {
        const onViewModeChanged = (): void => {
          if (useViewMode().viewMode.value.typewriter) requestAnimationFrame(() => keepCaretCentered(view))
        }
        window.addEventListener('muse:viewmode-changed', onViewModeChanged)
        return {
          destroy() {
            window.removeEventListener('muse:viewmode-changed', onViewModeChanged)
          },
          update(v: EditorView, prevState: { selection: { from: number } }) {
            if (!useViewMode().viewMode.value.typewriter) return
            if (v.state.selection.from !== prevState.selection.from) {
              requestAnimationFrame(() => keepCaretCentered(v))
            }
          },
        }
      },
    })
)
