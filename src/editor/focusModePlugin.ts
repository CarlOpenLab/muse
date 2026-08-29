/**
 * 专注模式（Typora F8）：非光标所在顶层块降低不透明度，落笔处保持全亮。
 * 纯 decoration + CSS 过渡，不改文档。
 */
import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey, type EditorState } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import type { Node as PMNode } from '@milkdown/prose/model'

export const focusModeKey = new PluginKey('muse-focus-mode')

function build(state: EditorState): DecorationSet {
  const { doc, selection } = state
  // 光标所在顶层块区间
  let activeFrom = -1
  let activeTo = -1
  doc.forEach((child: PMNode, offset: number) => {
    if (selection.from >= offset && selection.from <= offset + child.nodeSize) {
      activeFrom = offset
      activeTo = offset + child.nodeSize
    }
  })
  const decos: Decoration[] = []
  doc.forEach((child: PMNode, offset: number) => {
    if (offset >= activeFrom && offset < activeTo) return
    decos.push(Decoration.node(offset, offset + child.nodeSize, { class: 'muse-dim' }))
  })
  return decos.length ? DecorationSet.create(doc, decos) : DecorationSet.empty
}

export const focusModePlugin = $prose(
  () =>
    new Plugin<DecorationSet>({
      key: focusModeKey,
      state: {
        init: (_config, state) => build(state),
        apply: (_tr, _prev, _old, newState) => build(newState),
      },
      props: {
        decorations(state) {
          return focusModeKey.getState(state)
        },
      },
    })
)
