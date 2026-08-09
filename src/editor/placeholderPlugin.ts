import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey, type EditorState } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'

export const placeholderKey = new PluginKey<DecorationSet>('mdai-placeholder')

const TITLE_PLACEHOLDER = '无标题'

/**
 * 标题占位插件：文档首个空 H1（标题位）加 `data-placeholder` 装饰，
 * CSS 用 `::before` 渲染为「无标题」灰色提示。仅首个 H1、且内容为空时出现，
 * 用户在标题里输入任意字符后装饰消失。
 */
export const placeholderPlugin = $prose(() =>
  new Plugin<DecorationSet>({
    key: placeholderKey,
    state: {
      init: (_config, state) => build(state),
      apply: (tr, prev, _oldState, newState) => {
        // 选区变化不影响「是否空标题」，仅文档变更时重算
        if (!tr.docChanged) return prev
        return build(newState)
      }
    },
    props: {
      decorations(state) {
        return placeholderKey.getState(state)
      }
    }
  })
)

function build(state: EditorState): DecorationSet {
  const doc = state.doc
  const first = doc.firstChild
  if (
    first &&
    first.type.name === 'heading' &&
    first.attrs.level === 1 &&
    first.content.size === 0
  ) {
    const deco = Decoration.node(0, first.nodeSize, {
      'data-placeholder': TITLE_PLACEHOLDER
    })
    return DecorationSet.create(doc, [deco])
  }
  return DecorationSet.empty
}
