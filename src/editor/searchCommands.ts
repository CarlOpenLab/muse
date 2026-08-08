import { $command } from '@milkdown/utils'
import { TextSelection } from '@milkdown/prose/state'
import type { EditorState, Transaction } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import type { Node as PMNode } from '@milkdown/prose/model'
import { searchPluginKey } from './searchPlugin'
import { useSearch, type SearchAction } from '../composables/useSearch'

function findMatches(doc: PMNode, query: string): { from: number; to: number }[] {
  const result: { from: number; to: number }[] = []
  const lower = query.toLowerCase()
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const text = node.text.toLowerCase()
      let idx = text.indexOf(lower)
      while (idx !== -1) {
        result.push({ from: pos + idx, to: pos + idx + query.length })
        idx = text.indexOf(lower, idx + query.length)
      }
    }
    return true
  })
  return result
}

function gotoMatch(v: EditorView, m: { from: number; to: number }): void {
  v.dispatch(
    v.state.tr.setSelection(TextSelection.create(v.state.doc, m.from, m.to)).scrollIntoView()
  )
  v.focus()
}

function runSearch(v: EditorView): void {
  const search = useSearch()
  const q = search.query.value
  const found = q ? findMatches(v.state.doc, q) : []
  search.matches.value = found
  search.current.value = found.length ? Math.min(search.current.value, found.length - 1) : 0
  v.dispatch(
    v.state.tr.setMeta(searchPluginKey, {
      query: q,
      matches: found,
      current: search.current.value
    })
  )
  if (found.length) gotoMatch(v, found[search.current.value])
}

/**
 * 查找替换命令：payload 为动作，MilkdownCore 用
 * `editor.action(callCommand(searchCommand.key, action))` 触发。
 * ProseMirror Command 签名的第三个参数 view 直接可用，无需 ctx.get(editorViewCtx)。
 */
export const searchCommand = $command<SearchAction, 'mdai-search'>('mdai-search', () => {
  const search = useSearch()

  return (action?: SearchAction) =>
    (_state: EditorState, _dispatch?: (tr: Transaction) => void, view?: EditorView): boolean => {
      if (!view || !action) return false

      if (action === 'search') {
        runSearch(view)
        return true
      }

      const n = search.matches.value.length
      if (action === 'next' || action === 'prev') {
        if (!n) return false
        const dir = action === 'next' ? 1 : -1
        const next = (search.current.value + dir + n) % n
        search.current.value = next
        view.dispatch(
          view.state.tr.setMeta(searchPluginKey, {
            query: search.query.value,
            matches: search.matches.value,
            current: next
          })
        )
        gotoMatch(view, search.matches.value[next])
        return true
      }

      if (action === 'replace') {
        const m = search.matches.value[search.current.value]
        if (!m) return false
        view.dispatch(
          view.state.tr.replaceWith(m.from, m.to, view.state.schema.text(search.replaceText.value))
        )
        runSearch(view) // doc 已变，重搜
        return true
      }

      // replaceAll
      const q = search.query.value
      if (!q) return false
      const found = findMatches(view.state.doc, q)
      const repl = search.replaceText.value
      let tr = view.state.tr
      for (let i = found.length - 1; i >= 0; i--) {
        tr = tr.replaceWith(found[i].from, found[i].to, view.state.schema.text(repl))
      }
      view.dispatch(tr)
      search.matches.value = []
      search.current.value = 0
      view.dispatch(view.state.tr.setMeta(searchPluginKey, { query: q, matches: [], current: 0 }))
      return true
    }
})
