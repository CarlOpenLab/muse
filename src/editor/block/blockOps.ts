/**
 * 块级操作的事务实现（纯 ProseMirror，不依赖 Vue）。
 *
 * 定位：topLevelBlockAtY —— gutter（正文左外侧）按 Y 命中顶层块，
 *       做纵向 band 校验，避免块间空隙/文档末尾「粘」到最近块。
 * 操作：删除 / 创建副本 / 复制 Markdown / 句后插入空段落 / 块类型转换。
 */
import type { Ctx } from '@milkdown/ctx'
import { serializerCtx } from '@milkdown/core'
import type { Node as PMNode } from '@milkdown/prose/model'
import { NodeSelection, TextSelection } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import { runFormat, type FormatAction } from '../formatCommands'

export interface TopBlockHit {
  offset: number
  node: PMNode
  el: HTMLElement
}

/**
 * 按视口 Y 命中编辑器里的顶层块。
 * 命中列取正文水平中心（与官方 block 服务一致），再做纵向 band 校验：
 * 落点必须在该块 DOM 的上下边界内（±4px 容差），否则视为「块间空隙」。
 */
export function topLevelBlockAtY(view: EditorView, clientY: number): TopBlockHit | null {
  const rect = view.dom.getBoundingClientRect()
  if (clientY < rect.top - 4 || clientY > rect.bottom + 4) return null
  const res = view.posAtCoords({ left: rect.left + rect.width / 2, top: clientY })
  if (!res) return null
  const pos = res.inside ?? res.pos
  if (pos == null || pos < 0) return null
  const $pos = view.state.doc.resolve(pos)
  const offset = $pos.depth === 0 ? $pos.pos : $pos.before(1)
  const node = view.state.doc.nodeAt(offset)
  const el = view.nodeDOM(offset)
  if (!node || !(el instanceof HTMLElement)) return null
  const box = el.getBoundingClientRect()
  if (clientY < box.top - 4 || clientY > box.bottom + 4) return null
  return { offset, node, el }
}

/**
 * 把手柄点选留下的整块 NodeSelection 释放成块首文本光标。
 *
 * 这类选区只是官方 block 服务为「拖拽排序」建的；拖拽没发生（点一下手柄、
 * 或菜单被关掉）时它就是残留。留着的话，随后的打字 / 中文输入法起手会把
 * 整块内容替换掉 —— 静默丢内容。
 */
export function releaseStickyNodeSelection(view: EditorView): boolean {
  const { state } = view
  if (!(state.selection instanceof NodeSelection)) return false
  const from = state.selection.from
  view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(from + 1))))
  return true
}

/** 该块是否是可被 NodeSelection 选中的原子块（图片/表格等）。 */
export function isAtomicBlock(node: PMNode): boolean {
  return !node.isTextblock
}

/**
 * 删除顶层块。整篇仅剩这一块时用一个空段落兜底（与 trailing 语义一致），
 * 并总是把光标放到删除点附近，避免选区悬空。
 */
export function deleteBlock(view: EditorView, offset: number): void {
  const doc = view.state.doc
  const node = doc.nodeAt(offset)
  if (!node) return
  let tr = view.state.tr
  if (doc.childCount <= 1) {
    tr = tr.replaceWith(0, doc.content.size, view.state.schema.nodes.paragraph.create())
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(1)))
  } else {
    const to = offset + node.nodeSize
    tr = tr.delete(offset, to)
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(offset, tr.doc.content.size))))
  }
  view.dispatch(tr.scrollIntoView())
  view.focus()
}

/** 在块后插入一份相同内容的副本，并把光标放到副本内。 */
export function duplicateBlock(view: EditorView, offset: number): void {
  const node = view.state.doc.nodeAt(offset)
  if (!node) return
  const after = offset + node.nodeSize
  let tr = view.state.tr.insert(after, node)
  tr = tr.setSelection(NodeSelection.create(tr.doc, after))
  view.dispatch(tr.scrollIntoView())
  view.focus()
}

/** 把该块序列化为 Markdown 写入剪贴板。 */
export async function copyBlockMarkdown(ctx: Ctx, view: EditorView, offset: number): Promise<void> {
  const node = view.state.doc.nodeAt(offset)
  if (!node) return
  const serializer = ctx.get(serializerCtx)
  const doc = view.state.schema.topNodeType.create(null, node)
  const markdown = serializer(doc)
  try {
    await navigator.clipboard.writeText(markdown)
  } catch {
    // 剪贴板不可用（权限/非安全上下文）时静默失败
  }
}

/**
 * 在指定块后插入一个空段落，光标落入该段落，返回光标位置。
 * 若其后已经是一个空段落（trailing 插件常补）则直接复用，不叠空行。
 */
export function insertParagraphAfter(view: EditorView, offset: number): number {
  const doc = view.state.doc
  const node = doc.nodeAt(offset)
  if (!node) return -1
  const after = offset + node.nodeSize
  const next = doc.nodeAt(after)
  const paragraph = view.state.schema.nodes.paragraph
  let tr = view.state.tr
  if (!(next && next.type === paragraph && next.content.size === 0)) {
    tr = tr.insert(after, paragraph.create())
  }
  const caret = after + 1
  tr = tr.setSelection(TextSelection.near(tr.doc.resolve(caret)))
  view.dispatch(tr.scrollIntoView())
  view.focus()
  return caret
}

/**
 * 把光标放进目标块后执行格式化动作（「转换为…」与插入菜单共用）。
 * 先落 TextSelection 再走既有 runFormat 总线：格式命令都按文本光标语义实现，
 * NodeSelection 会让 wrapIn 类命令行为异常。
 */
export function convertBlock(ctx: Ctx, view: EditorView, offset: number, action: FormatAction): boolean {
  const node = view.state.doc.nodeAt(offset)
  if (!node) return false
  const $inside = view.state.doc.resolve(offset + 1)
  view.dispatch(view.state.tr.setSelection(TextSelection.near($inside)))
  return runFormat(ctx, action)
}

/**
 * 在指定光标位置执行格式化动作（＋ 插入菜单：把新空段落变成所选类型）。
 * 位置已失效（菜单打开期间文档被改动）时放弃，不抛错。
 */
export function formatAt(ctx: Ctx, view: EditorView, caretPos: number, action: FormatAction): boolean {
  const size = view.state.doc.content.size
  if (caretPos < 0 || caretPos > size) return false
  const $pos = view.state.doc.resolve(caretPos)
  view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)))
  return runFormat(ctx, action)
}
