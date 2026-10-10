import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet, type EditorView } from '@milkdown/prose/view'
import type { Node } from '@milkdown/prose/model'
import type { HighlighterCore } from 'shiki/core'
import type { ThemedToken } from 'shiki'
import { getHighlighter, tokenize, getActiveShikiTheme } from './highlighter'

/**
 * Shiki 代码块高亮 -- Milkdown/ProseMirror 插件。
 *
 * 思路：用 ProseMirror **inline decoration** 把 Shiki token 的颜色叠加到
 * `code_block` 节点的文本上。ProseMirror 的 decoration 机制只包裹文本、
 * 不改变 underlying text DOM，因此光标完全原生，打字即时高亮，最 Typora。
 *
 * - Shiki 高亮器异步初始化；完成后 dispatch 一个 meta 触发重新着色；
 * - `codeToTokens` 同步且快，每次文档变更重建 decoration；
 * - 按 `${theme}\0${lang}\0${text}` 缓存切词结果（主题不同颜色不同，必须入键）；
 * - 校验 token 字符总数与文本长度一致才着色，错位则放弃（避免乱标）；
 * - `refreshShikiHighlight()` 供主题切换后外部调用以重建着色。
 */

const key = new PluginKey<DecorationSet>('shiki-code-block')

// 单编辑器假设：保存当前 view，供主题切换后外部触发重建
let activeView: EditorView | null = null

const cache = new Map<string, ThemedToken[][] | null>()
function cachedTokenize(
  hl: HighlighterCore,
  code: string,
  lang: string,
): ThemedToken[][] | null {
  // 主题不同则 token 颜色不同，缓存键必须含主题
  const k = getActiveShikiTheme() + '\0' + lang + '\0' + code
  let v = cache.get(k)
  if (v === undefined) {
    v = tokenize(hl, code, lang)
    if (cache.size > 256) cache.clear()
    cache.set(k, v)
  }
  return v
}

function buildDecorations(hl: HighlighterCore | null, doc: Node): DecorationSet {
  if (!hl) return DecorationSet.empty
  const decos: Decoration[] = []

  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return
    const lang = String(node.attrs.language ?? '')
    const text = node.textContent
    if (!text) return

    const tokens = cachedTokenize(hl, text, lang)
    if (!tokens) return

    // 校验：token 字符总数 + 换行数必须等于文本长度，否则放弃着色
    let chars = 0
    for (let i = 0; i < tokens.length; i++) {
      for (const t of tokens[i]) chars += t.content.length
      if (i < tokens.length - 1) chars += 1
    }
    if (chars !== text.length) return

    let offset = 0
    const start = pos + 1 // 进入 code_block 节点后的文本起点
    for (let i = 0; i < tokens.length; i++) {
      for (const t of tokens[i]) {
        const len = t.content.length
        if (t.color && len > 0) {
          decos.push(
            Decoration.inline(start + offset, start + offset + len, {
              style: `color:${t.color}`,
            }),
          )
        }
        offset += len
      }
      if (i < tokens.length - 1) offset += 1 // 换行符占 1 字符
    }
  })

  return DecorationSet.create(doc, decos)
}

/** 主题切换后调用：用新主题的 token 颜色重新着色。Shiki 未就绪时为空操作。 */
export function refreshShikiHighlight(): void {
  if (activeView) {
    activeView.dispatch(activeView.state.tr.setMeta(key, { ready: true }))
  }
}

export const shikiCodeBlock = $prose(() => {
  let hl: HighlighterCore | null = null
  let pendingReady = false

  getHighlighter()
    .then((h) => {
      hl = h
      if (activeView) activeView.dispatch(activeView.state.tr.setMeta(key, { ready: true }))
      else pendingReady = true
    })
    .catch((e) => console.error('[muse] shiki: init FAILED', e))

  return new Plugin<DecorationSet>({
    key,
    state: {
      init(_, state) {
        return buildDecorations(hl, state.doc)
      },
      apply(tr, old, _oldState, newState) {
        if (tr.docChanged || tr.getMeta(key)) {
          return buildDecorations(hl, newState.doc)
        }
        return old
      },
    },
    props: {
      decorations(state) {
        return key.getState(state) ?? DecorationSet.empty
      },
    },
    view(editorView) {
      activeView = editorView
      if (pendingReady) {
        pendingReady = false
        editorView.dispatch(editorView.state.tr.setMeta(key, { ready: true }))
      }
      return {}
    },
  })
})
