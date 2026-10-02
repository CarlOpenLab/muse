/**
 * 多块范围选择（Notion 式）：从正文左侧空白（gutter）按下并纵向拖拽，
 * 整片顶层块高亮；随后可整体删除 / 复制 / 剪切 / 拖拽移动。
 *
 * 设计要点：
 * - 范围只存顶层块偏移（anchor/head），高亮用 NodeDecoration 的
 *   data-muse-block-selected 属性 —— 不用 class，避免与专注模式的 muse-dim 打架。
 * - 进入时同时落一个「折叠的 TextSelection」在范围起点：编辑器拿到 DOM 焦点，
 *   ⌘C/⌘X/Del 才会经过编辑器；折叠光标而非 NodeSelection，中文输入法
 *   起手打字不会整块替换。
 * - 退出：正文内 mousedown / Escape / 文档被改动（输入、粘贴、撤销）/ 源码模式。
 */
import { $prose } from '@milkdown/utils'
import { watch } from 'vue'
import {
  Plugin,
  PluginKey,
  NodeSelection,
  TextSelection,
  type EditorState,
  type PluginView,
} from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import type { EditorView } from '@milkdown/prose/view'
import type { Node as PMNode } from '@milkdown/prose/model'
import { dropPoint } from '@milkdown/prose/transform'
import {
  clearBlockRange,
  hasBlockRange,
  isGroupDragActive,
  setBlockRange,
  setBlockRangeClearer,
  setGroupDragActive,
  type BlockRange,
} from './blockSelectionState'
import { topLevelBlockAtY } from './blockOps'
import { setSelectionSnapshot } from '../../composables/useEditorSelection'
import { useViewMode } from '../../composables/useViewMode'

export const blockSelectionKey = new PluginKey<BlockRange | null>('MUSE_BLOCK_SELECTION')

/** 范围覆盖的文档区间（from = 首块起点，to = 末块终点，右开）。 */
export function rangeBounds(doc: PMNode, r: BlockRange): { from: number; to: number } {
  const a = Math.min(r.anchor, r.head)
  const b = Math.max(r.anchor, r.head)
  const last = doc.nodeAt(b)
  return { from: a, to: b + (last ? last.nodeSize : 0) }
}

/** 指定偏移是否落在范围内。 */
export function inBlockRange(doc: PMNode, r: BlockRange, offset: number): boolean {
  const { from, to } = rangeBounds(doc, r)
  return offset >= from && offset < to
}

/** 范围当前选中的顶层块数。 */
export function blockRangeCount(doc: PMNode, r: BlockRange): number {
  const { from, to } = rangeBounds(doc, r)
  let n = 0
  doc.forEach((child: PMNode, offset: number) => {
    if (offset >= from && offset + child.nodeSize <= to) n++
  })
  return n
}

function buildDecorations(doc: PMNode, r: BlockRange | null): DecorationSet {
  if (!r) return DecorationSet.empty
  const { from, to } = rangeBounds(doc, r)
  const decos: Decoration[] = []
  doc.forEach((child: PMNode, offset: number) => {
    const end = offset + child.nodeSize
    if (offset >= from && end <= to) {
      decos.push(Decoration.node(offset, end, { 'data-muse-block-selected': '' }))
    }
  })
  return decos.length ? DecorationSet.create(doc, decos) : DecorationSet.empty
}

/** 写转 AI 侧栏的选区快照（range 激活时由本插件独占，selectionPlugin 会让位）。 */
function syncSnapshot(view: EditorView, r: BlockRange | null): void {
  if (!r) return
  const { from, to } = rangeBounds(view.state.doc, r)
  const text = view.state.doc.textBetween(from, to, '\n').trim()
  setSelectionSnapshot(text ? { from, to, text } : null)
}

class BlockSelectionView implements PluginView {
  #view: EditorView
  #dragging = false
  #stopModeWatch: (() => void) | null = null
  #destroyed = false
  #cleanup: () => void

  constructor(view: EditorView) {
    this.#view = view
    window.addEventListener('mousedown', this.#onMouseDown, true)
    window.addEventListener('mousemove', this.#onMouseMove, true)
    window.addEventListener('mouseup', this.#onMouseUp, true)
    view.dom.addEventListener('compositionstart', this.#onCompositionStart, true)
    this.#cleanup = () => {
      window.removeEventListener('mousedown', this.#onMouseDown, true)
      window.removeEventListener('mousemove', this.#onMouseMove, true)
      window.removeEventListener('mouseup', this.#onMouseUp, true)
      view.dom.removeEventListener('compositionstart', this.#onCompositionStart, true)
    }
    this.#stopModeWatch = watch(useViewMode().viewMode, (mode) => {
      if (mode.source && blockSelectionKey.getState(view.state)) this.#apply(view, null)
    })
    // 外部（导出前等）请求清除：连同编辑器交易一起清掉高亮
    setBlockRangeClearer(() => {
      if (this.#destroyed) return
      if (blockSelectionKey.getState(view.state)) this.#apply(view, null)
    })
  }

  update = (v: EditorView): void => {
    if (this.#destroyed) return
    const r = blockSelectionKey.getState(v.state) ?? null
    // 模块 ref 跟插件状态对齐：撤销等 docChanged 会清插件状态，ref 不能留旧值
    // （否则 hasBlockRange() 永久为真，气泡工具条再也不弹）
    setBlockRange(r)
    if (r) syncSnapshot(v, r)
  }

  destroy = (): void => {
    this.#destroyed = true
    setBlockRangeClearer(null)
    this.#stopModeWatch?.()
    this.#cleanup()
    clearBlockRange()
  }

  // ---- gutter 起手 / 扩展 ----

  #onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return
    const view = this.#view
    if (!view.editable || view.composing || useViewMode().viewMode.value.source) return
    const target = e.target as Node | null
    if (!target) return
    // 正文内按下：普通文本选择，清掉范围
    if (view.dom.contains(target)) {
      if (hasBlockRange()) this.#apply(view, null)
      return
    }
    // 只接管正文左外侧空白（手柄/菜单挂 body，不在 .editor-scroll 内，天然排除）
    const scroll = view.dom.closest('.editor-scroll')
    if (!scroll || !scroll.contains(target)) return
    if (e.clientX >= view.dom.getBoundingClientRect().left) return
    const hit = topLevelBlockAtY(view, e.clientY)
    if (!hit) return
    e.preventDefault()
    this.#dragging = true
    this.#apply(view, { anchor: hit.offset, head: hit.offset }, true)
  }

  #onMouseMove = (e: MouseEvent): void => {
    if (!this.#dragging || this.#destroyed) return
    const view = this.#view
    const hit = topLevelBlockAtY(view, e.clientY)
    if (!hit) {
      this.#autoScroll(e.clientY)
      return
    }
    const cur = blockSelectionKey.getState(view.state)
    if (cur && cur.head === hit.offset) return
    this.#apply(view, { anchor: cur?.anchor ?? hit.offset, head: hit.offset })
    this.#autoScroll(e.clientY)
  }

  #onMouseUp = (): void => {
    this.#dragging = false
  }

  /** 输入法起手：先把光标落到范围起点（防整块被输入替换），再让 IME 正常走。 */
  #onCompositionStart = (): void => {
    const view = this.#view
    if (!blockSelectionKey.getState(view.state)) return
    this.#collapseToStart(view)
  }

  #apply(view: EditorView, range: BlockRange | null, focus = false): void {
    setBlockRange(range)
    const tr = view.state.tr.setMeta(blockSelectionKey, range)
    if (range) {
      const { from } = rangeBounds(view.state.doc, range)
      tr.setSelection(TextSelection.near(view.state.doc.resolve(from + 1)))
    }
    view.dispatch(tr)
    if (focus) view.focus()
  }

  /** 收成范围起点的文本光标（范围本身由同一笔交易清除）。 */
  #collapseToStart(view: EditorView): void {
    const r = blockSelectionKey.getState(view.state)
    if (!r) return
    const { from } = rangeBounds(view.state.doc, r)
    setBlockRange(null)
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.near(view.state.doc.resolve(from + 1)))
        .setMeta(blockSelectionKey, null)
    )
  }

  /** 拖到视口上下缘时自动滚动（跟随鼠标事件节拍，非 rAF 常驻）。 */
  #autoScroll(clientY: number): void {
    const scroll = this.#view.dom.closest('.editor-scroll') as HTMLElement | null
    if (!scroll) return
    const rect = scroll.getBoundingClientRect()
    const band = 48
    if (clientY < rect.top + band) scroll.scrollTop -= 24
    else if (clientY > rect.bottom - band) scroll.scrollTop += 24
  }
}

export const blockSelectionPlugin = $prose(
  () =>
    new Plugin<BlockRange | null>({
      key: blockSelectionKey,
      state: {
        init: () => null,
        apply: (tr, value) => {
          // 显式 meta 优先（含删除/移动后我们要保留新范围的场景）
          const meta = tr.getMeta(blockSelectionKey)
          if (meta !== undefined) return meta as BlockRange | null
          if (tr.docChanged) return null // 输入 / 粘贴 / 撤销后退出
          return value
        },
      },
      view: (view) => new BlockSelectionView(view),
      props: {
        decorations(state: EditorState) {
          return buildDecorations(state.doc, blockSelectionKey.getState(state) ?? null)
        },
        handleKeyDown(view, event) {
          const r = blockSelectionKey.getState(view.state)
          if (!r) {
            // 拖拽手柄留下的 NodeSelection 很「粘」：不处理的话拖选不回文本选区、
            // 打字会把整块替换掉。Esc 收回成普通文本光标（Notion 同款）。
            if (event.key === 'Escape' && view.state.selection instanceof NodeSelection) {
              const from = view.state.selection.from
              view.dispatch(
                view.state.tr.setSelection(
                  TextSelection.near(view.state.doc.resolve(from + 1))
                )
              )
              return true
            }
            return false
          }
          if (event.key === 'Escape') {
            clearRange(view)
            return true
          }
          if (event.key === 'Backspace' || event.key === 'Delete') {
            deleteRange(view, r)
            return true
          }
          // 可打印字符：先收成范围起点的文本光标，再放行本次输入
          if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
            collapseForTyping(view, r)
            return false
          }
          return false
        },
        handleDOMEvents: {
          copy(view, event) {
            const r = blockSelectionKey.getState(view.state)
            if (!r) return false
            writeRangeToClipboard(view, r, event as ClipboardEvent)
            return true
          },
          cut(view, event) {
            const r = blockSelectionKey.getState(view.state)
            if (!r) return false
            writeRangeToClipboard(view, r, event as ClipboardEvent)
            deleteRange(view, r)
            return true
          },
        },
        /**
         * 整片组拖拽的落点：prosemirror-view 的 drop 对 move 只删「当前选中的单个节点」
         * （tr.deleteSelection()），对整片范围会漏删。这里接管：一步事务里
         * 删源区间 + 插到落点，并按 Alt（复制）语义区分。
         */
        handleDrop(view, event, slice, moved) {
          if (!moved || !slice || !isGroupDragActive()) return false
          const r = blockSelectionKey.getState(view.state)
          if (!r) return false
          const e = event as DragEvent
          const coords = view.posAtCoords({ left: e.clientX, top: e.clientY })
          if (!coords) return false
          const doc = view.state.doc
          const { from, to } = rangeBounds(doc, r)
          const insert = dropPoint(doc, coords.pos, slice) ?? coords.pos
          const copy = e.altKey // mac：Alt 拖 = 复制
          let tr = copy ? view.state.tr : view.state.tr.delete(from, to)
          const pos = copy ? insert : tr.mapping.map(insert)
          tr = tr.replaceRange(pos, pos, slice)
          const last = slice.content.lastChild
          const head = pos + slice.content.size - (last ? last.nodeSize : 0)
          const next: BlockRange | null = copy ? null : { anchor: pos, head }
          setGroupDragActive(false)
          setBlockRange(next)
          if (!copy) tr = tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)))
          tr = tr.setMeta(blockSelectionKey, next).setMeta('uiEvent', 'drop')
          view.dispatch(tr.scrollIntoView())
          // 手柄起手的拖拽走的是按钮元素，drop 后焦点还在按钮上：
          // 必须显式交还编辑器，否则随后的 ⌘Z / ⌘B / 打字都不生效
          view.focus()
          return true
        },
      },
    })
)

/** 清空范围并把光标放回正文（Escape）。 */
function clearRange(view: EditorView): void {
  const r = blockSelectionKey.getState(view.state)
  if (!r) return
  const { from } = rangeBounds(view.state.doc, r)
  setBlockRange(null)
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.near(view.state.doc.resolve(from + 1)))
      .setMeta(blockSelectionKey, null)
  )
  view.focus()
}

/** 打字符前的收口：光标落到范围起点，范围清除（随后由输入交易清 doc）。 */
function collapseForTyping(view: EditorView, r: BlockRange): void {
  const { from } = rangeBounds(view.state.doc, r)
  setBlockRange(null)
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.near(view.state.doc.resolve(from + 1)))
      .setMeta(blockSelectionKey, null)
  )
  view.focus()
}

/** 删除范围内的全部顶层块；整篇被选中时用一个空段落兜底。 */
function deleteRange(view: EditorView, r: BlockRange): void {
  const doc = view.state.doc
  const { from, to } = rangeBounds(doc, r)
  setBlockRange(null)
  let tr = view.state.tr
  if (from === 0 && to >= doc.content.size) {
    tr = tr.replaceWith(0, doc.content.size, view.state.schema.nodes.paragraph.create())
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(1)))
  } else {
    tr = tr.delete(from, to)
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(from, tr.doc.content.size))))
  }
  tr.setMeta(blockSelectionKey, null)
  view.dispatch(tr.scrollIntoView())
  view.focus()
}

/** 把范围内容同时以 text/html 与 text/plain 写入剪贴板（与编辑器原生复制同构）。 */
function writeRangeToClipboard(view: EditorView, r: BlockRange, event: ClipboardEvent): void {
  const { from, to } = rangeBounds(view.state.doc, r)
  const slice = view.state.doc.slice(from, to)
  const { dom, text } = view.serializeForClipboard(slice)
  event.clipboardData?.setData('text/html', dom.innerHTML)
  event.clipboardData?.setData('text/plain', text)
  event.preventDefault()
}
