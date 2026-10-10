/**
 * 文档编辑工具的执行器（渲染进程编辑器侧）。
 * 由 MilkdownCore 在 editor action 中调用（它持有 view / parser / schema）；
 * 所有修改走 ProseMirror transaction，可 ⌘Z 撤销，并触发 markdownUpdated 回传。
 */
import type { EditorView } from '@milkdown/prose/view'
import type { Node as PMNode, Schema } from '@milkdown/prose/model'
import { Slice } from '@milkdown/prose/model'
import { TOOL, type ToolResult } from '../chat/editorTools'

export interface ToolCtx {
  view: EditorView
  schema: Schema
  /** 把 markdown 解析成 ProseMirror 节点（用于插入 / 替换带格式的内容） */
  parser: (markdown: string) => PMNode | null
}

export function handleEditorTool(ctx: ToolCtx, name: string, args: unknown): ToolResult {
  switch (name) {
    case TOOL.GET_DOCUMENT:
      return getDocument(ctx)
    case TOOL.GET_SELECTION:
      return getSelection(ctx)
    case TOOL.REPLACE_SELECTION:
      return replaceSelection(ctx, args)
    case TOOL.INSERT_AT_CURSOR:
      return insertAt(ctx, args, 'cursor')
    case TOOL.INSERT_AT_END:
      return insertAt(ctx, args, 'end')
    case TOOL.REPLACE_TEXT:
      return replaceText(ctx, args)
    default:
      return { ok: false, message: `未知工具：${name}` }
  }
}

function strArg(args: unknown, key: string): string {
  const v = (args as Record<string, unknown> | undefined)?.[key]
  return typeof v === 'string' ? v : ''
}

/** 把 markdown 解析成 Slice（失败返回 null） */
function parseSlice(ctx: ToolCtx, markdown: string): Slice | null {
  const doc = ctx.parser(markdown)
  if (!doc) return null
  return new Slice(doc.content, 0, 0)
}

function getDocument(ctx: ToolCtx): ToolResult {
  const { doc } = ctx.view.state
  const headings: { level: number; text: string }[] = []
  doc.descendants((node) => {
    if (node.type.name === 'heading') {
      headings.push({ level: node.attrs.level as number, text: node.textContent })
    }
    return true
  })
  const text = doc.textBetween(0, doc.content.size, '\n')
  const MAX = 8000
  const truncated =
    text.length > MAX ? `${text.slice(0, MAX)}\n…（已截断，全文共 ${text.length} 字符）` : text
  return { ok: true, message: '已读取当前文档', data: { headings, text: truncated } }
}

function getSelection(ctx: ToolCtx): ToolResult {
  const { from, to } = ctx.view.state.selection
  const { doc } = ctx.view.state
  if (from === to) {
    const s = Math.max(0, from - 200)
    const e = Math.min(doc.content.size, from + 200)
    const context = doc.textBetween(s, e, '\n')
    return {
      ok: true,
      message: '当前无选区，已返回光标附近上下文',
      data: { selection: null, context },
    }
  }
  const text = doc.textBetween(from, to, '\n').trim()
  return { ok: true, message: '已读取选中文字', data: { selection: text } }
}

function replaceSelection(ctx: ToolCtx, args: unknown): ToolResult {
  const content = strArg(args, 'content')
  if (!content) return { ok: false, message: '缺少 content 参数' }
  const slice = parseSlice(ctx, content)
  if (!slice) return { ok: false, message: '内容解析失败' }
  const { from, to } = ctx.view.state.selection
  ctx.view.dispatch(ctx.view.state.tr.replace(from, to, slice).scrollIntoView())
  ctx.view.focus()
  return { ok: true, message: `已替换选中文字（${content.length} 字符）` }
}

function insertAt(ctx: ToolCtx, args: unknown, where: 'cursor' | 'end'): ToolResult {
  const content = strArg(args, 'content')
  if (!content) return { ok: false, message: '缺少 content 参数' }
  const slice = parseSlice(ctx, content)
  if (!slice) return { ok: false, message: '内容解析失败' }
  const { state } = ctx.view
  const pos = where === 'cursor' ? state.selection.from : state.doc.content.size
  ctx.view.dispatch(state.tr.replace(pos, pos, slice).scrollIntoView())
  ctx.view.focus()
  return { ok: true, message: `已在${where === 'cursor' ? '光标处' : '文档末尾'}插入 ${content.length} 字符` }
}

function replaceText(ctx: ToolCtx, args: unknown): ToolResult {
  const search = strArg(args, 'search')
  const content = strArg(args, 'content')
  const replaceAll = Boolean((args as Record<string, unknown> | undefined)?.replaceAll)
  if (!search) return { ok: false, message: '缺少 search 参数' }
  if (!content) return { ok: false, message: '缺少 content 参数' }

  const { state } = ctx.view
  const matches: { from: number; to: number }[] = []
  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true
    const text = node.text
    let idx = text.indexOf(search)
    while (idx !== -1) {
      matches.push({ from: pos + idx, to: pos + idx + search.length })
      if (!replaceAll) return false
      idx = text.indexOf(search, idx + search.length)
    }
    return true
  })

  if (!matches.length) return { ok: false, message: `全文未找到「${search}」` }

  const tr = state.tr
  // 从后往前替换：位置不会因前面的替换而漂移
  for (let i = matches.length - 1; i >= 0; i--) {
    tr.replaceWith(matches[i].from, matches[i].to, state.schema.text(content))
  }
  ctx.view.dispatch(tr.scrollIntoView())
  ctx.view.focus()
  return { ok: true, message: `已替换 ${matches.length} 处「${search}」→「${content}」` }
}
