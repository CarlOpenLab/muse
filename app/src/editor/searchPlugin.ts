import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'

export interface SearchState {
  query: string
  matches: { from: number; to: number }[]
  current: number
}

export const searchPluginKey = new PluginKey<SearchState>('muse-search')

/**
 * 查找替换高亮插件。
 * MilkdownCore 在搜索/替换时用 `tr.setMeta(searchPluginKey, {...})` 更新状态，
 * decorations 渲染所有匹配（当前匹配用不同颜色）。
 */
export const searchPlugin = $prose(() =>
  new Plugin<SearchState>({
    key: searchPluginKey,
    state: {
      init: () => ({ query: '', matches: [], current: 0 }),
      apply(tr, value) {
        const meta = tr.getMeta(searchPluginKey) as SearchState | undefined
        if (meta) return meta
        // 文档被编辑时匹配位置失效，清空高亮（下次输入/动作会重搜）
        if (tr.docChanged) return { query: value.query, matches: [], current: 0 }
        return value
      }
    },
    props: {
      decorations(state) {
        const s = searchPluginKey.getState(state)
        if (!s || !s.matches.length) return DecorationSet.empty
        const decos = s.matches.map((m, i) =>
          Decoration.inline(m.from, m.to, {
            class: i === s.current ? 'search-match current' : 'search-match'
          })
        )
        return DecorationSet.create(state.doc, decos)
      }
    }
  })
)
