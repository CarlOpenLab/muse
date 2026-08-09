import { $prose } from '@milkdown/utils'
import { Plugin } from '@milkdown/prose/state'
import { setSelectionSnapshot } from '../composables/useEditorSelection'

/**
 * 选区跟踪插件：编辑器里选中文字时，把 {from, to, text} 快照到模块级单例，
 * 供 AI 侧栏做「润色 / 扩写 / 翻译 / 总结 / 替换选中」等文档编辑操作。
 *
 * 注意：即使编辑器失焦，ProseMirror 的 selection 仍保留在 state 中，
 * 用户去侧栏点快捷操作时选区快照依然有效。
 */
export const selectionPlugin = $prose(() =>
  new Plugin({
    view: (view) => ({
      update: (view) => {
        const { from, to } = view.state.selection
        if (from !== to) {
          const text = view.state.doc.textBetween(from, to, '\n').trim()
          if (text) {
            setSelectionSnapshot({ from, to, text })
            return
          }
        }
        setSelectionSnapshot(null)
      },
    }),
  })
)
