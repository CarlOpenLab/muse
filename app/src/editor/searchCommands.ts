import { $command } from '@milkdown/utils'
import { TextSelection } from '@milkdown/prose/state'
import type { EditorState, Transaction } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import type { Node as PMNode } from '@milkdown/prose/model'
import { searchPluginKey } from './searchPlugin'
import { useSearch, type SearchAction, type SearchMatch } from '../composables/useSearch'

// 结果列表片段：命中词前后各留一点上下文
const SNIPPET_BEFORE = 20
const SNIPPET_AFTER = 60

/** 取命中词所在段落的一小段文本，供右栏结果列表展示 */
function snippetAt(doc: PMNode, from: number, len: number): { text: string; hit: number } {
  const $from = doc.resolve(from)
  const full = $from.parent.textContent
  const off = Math.min($from.parentOffset, full.length)
  const start = Math.max(0, off - SNIPPET_BEFORE)
  const end = Math.min(full.length, off + len + SNIPPET_AFTER)
  const head = start > 0 ? '…' : ''
  // 软换行（hard_break 的 leafText）在单行列表里会撑出空白，等长换成空格不影响 hit 下标
  const body = full.slice(start, end).replace(/\n/g, ' ')
  return {
    text: head + body + (end < full.length ? '…' : ''),
    hit: head.length + (off - start)
  }
}

function findMatches(doc: PMNode, query: string): SearchMatch[] {
  const result: SearchMatch[] = []
  const lower = query.toLowerCase()
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const text = node.text.toLowerCase()
      let idx = text.indexOf(lower)
      while (idx !== -1) {
        const from = pos + idx
        result.push({ from, to: from + query.length, ...snippetAt(doc, from, query.length) })
        idx = text.indexOf(lower, idx + query.length)
      }
    }
    return true
  })
  return result
}

/**
 * 滚到某个命中处。focus 仅在「点结果列表」这种明确的跳转意图下为 true——
 * 边输入边搜时抢走焦点会把后续按键打进正文。
 */
function gotoMatch(v: EditorView, m: SearchMatch, focus = false): void {
  v.dispatch(
    v.state.tr.setSelection(TextSelection.create(v.state.doc, m.from, m.to)).scrollIntoView()
  )
  if (focus) v.focus()
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
export const searchCommand = $command<SearchAction, 'muse-search'>('muse-search', () => {
  const search = useSearch()

  return (action?: SearchAction) =>
    (_state: EditorState, _dispatch?: (tr: Transaction) => void, view?: EditorView): boolean => {
      if (!view || !action) return false

      if (action === 'search') {
        runSearch(view)
        return true
      }

      const n = search.matches.value.length
      // next / prev 是相对当前项移动，goto 直接用 SearchPanel 已经写好的 current
      if (action === 'next' || action === 'prev' || action === 'goto') {
        if (!n) return false
        const dir = action === 'next' ? 1 : action === 'prev' ? -1 : 0
        const next = (search.current.value + dir + n) % n
        search.current.value = next
        view.dispatch(
          view.state.tr.setMeta(searchPluginKey, {
            query: search.query.value,
            matches: search.matches.value,
            current: next
          })
        )
        gotoMatch(view, search.matches.value[next], action === 'goto')
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
