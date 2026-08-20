import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey, type EditorState } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'

export const placeholderKey = new PluginKey<DecorationSet>('muse-placeholder')

const TITLE_PLACEHOLDER = '无标题'
const BODY_PLACEHOLDER = '开始书写…'

/**
 * 标题 + 正文占位插件：
 * - 标题：文档首个空 H1 加 `data-placeholder="无标题"`，CSS ::before 渲染
 * - 正文：标题后首个空段落（或单空段落文档）加 `data-body-placeholder`，CSS ::before 渲染
 * 两个占位互不干扰，输入后各自消失。
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
  const decos: Decoration[] = []

  // 标题占位：首节点为一级空标题
  if (
    first &&
    first.type.name === 'heading' &&
    first.attrs.level === 1 &&
    first.content.size === 0
  ) {
    decos.push(
      Decoration.node(0, first.nodeSize, {
        'data-placeholder': TITLE_PLACEHOLDER
      })
    )
  }

  // 正文占位：寻找首个空段落（新建空白文档的正文位）
  // - 有标题时：标题后第一个空段落
  // - 无标题时：首个空段落
  let bodyPos: number | null = null
  let bodyNode: any = null
  if (first && first.type.name === 'heading') {
    let pos = first.nodeSize
    for (let i = 1; i < doc.childCount; i++) {
      const child = doc.child(i)
      if (child.type.name === 'paragraph' && child.content.size === 0) {
        bodyPos = pos
        bodyNode = child
        break
      }
      pos += child.nodeSize
      // 遇到非空段落即停止（已有正文，不再占位）
      if (child.content.size > 0) break
    }
  } else if (
    first &&
    first.type.name === 'paragraph' &&
    first.content.size === 0
  ) {
    bodyPos = 0
    bodyNode = first
  }
  if (bodyPos !== null && bodyNode) {
    decos.push(
      Decoration.node(bodyPos, bodyPos + bodyNode.nodeSize, {
        'data-body-placeholder': BODY_PLACEHOLDER
      })
    )
  }

  // 调试：可在控制台查看占位是否命中
  // if (typeof window !== 'undefined' && decos.length) console.debug('[placeholder] decos', decos.map(d => d.spec))
  return decos.length ? DecorationSet.create(doc, decos) : DecorationSet.empty
}
