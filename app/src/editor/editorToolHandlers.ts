/**
 * AI 文档工具的**执行器**（运行在渲染进程、Milkdown 的 editor action 里，因此能拿到 view/parser/schema）。
 *
 * 与旧版的区别：
 * - 读类工具（outline / read / find）基于 buildDocIndex 的章节索引，长文可分段读，不再静默截断。
 * - 写类工具不再直接落笔，而是算好「目标区间 + 新内容 + diff」存成 proposal，等用户确认。
 * - 定位不再只靠精确字符串匹配：整节改动用章节 id，小改动才用文本匹配，且多处命中会报错而不是乱改。
 */
import { Slice } from '@milkdown/prose/model'
import type { Node as PMNode, Schema } from '@milkdown/prose/model'
import type { EditorView } from '@milkdown/prose/view'
import { TOOL, type ToolResult } from '../chat/editorTools'
import {
  buildDocIndex,
  listSections,
  locateSection,
  sliceDoc,
  type DocIndex,
  type FlatBlock,
} from '../chat/agent/docIndex'
import { diffLines } from '../chat/agent/diff'
import { addProposal, dedupeProposals } from '../chat/proposals'

export interface ToolCtx {
  view: EditorView
  schema: Schema
  parser: (markdown: string) => PMNode | null
}

/* ---------- 小工具 ---------- */

function strArg(args: Record<string, unknown>, key: string): string {
  const v = args?.[key]
  return typeof v === 'string' ? v : ''
}

function numArg(args: Record<string, unknown>, key: string): number | undefined {
  const v = args?.[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

function asRecord(args: unknown): Record<string, unknown> {
  return args && typeof args === 'object' && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : {}
}

function clampText(text: string, max = 30): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/* ---------- 文档索引 ---------- */

/** 把编辑器顶层块拍平成 FlatBlock[]（标题带层级）。 */
function flatBlocks(view: EditorView): FlatBlock[] {
  const out: FlatBlock[] = []
  view.state.doc.forEach((node, offset) => {
    const isHeading = node.type.name === 'heading'
    out.push({
      kind: isHeading ? 'heading' : 'block',
      level: isHeading ? Number(node.attrs.level ?? 1) : 0,
      text: node.textContent,
      from: offset,
      to: offset + node.nodeSize,
    })
  })
  return out
}

function docIndexOf(view: EditorView): DocIndex {
  return buildDocIndex(flatBlocks(view))
}

/** 在文本节点里查找 query，返回 ProseMirror 位置区间（跨 mark 也能命中）。 */
function findTextRanges(
  doc: PMNode,
  query: string,
  ignoreCase: boolean
): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = []
  if (!query) return ranges
  const needle = ignoreCase ? query.toLowerCase() : query
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const hay = ignoreCase ? node.text.toLowerCase() : node.text
    let i = hay.indexOf(needle)
    while (i >= 0) {
      ranges.push({ from: pos + i, to: pos + i + query.length })
      i = hay.indexOf(needle, i + 1)
    }
  })
  return ranges
}

function parseSlice(ctx: ToolCtx, markdown: string): Slice | null {
  const node = ctx.parser(markdown)
  if (!node) return null
  return new Slice(node.content, 0, 0)
}

/* ---------- 读工具 ---------- */

function getOutline(ctx: ToolCtx): ToolResult {
  const index = docIndexOf(ctx.view)
  const sections = listSections(index)
  const hasTitle = sections.some((s) => s.level === 1)
  return {
    ok: true,
    message: `文档共 ${index.charCount} 字符、${index.lineCount} 个块、${sections.length} 个标题${
      hasTitle ? '' : '（没有一级标题）'
    }。`,
    data: {
      charCount: index.charCount,
      blockCount: index.lineCount,
      sections,
      hint: sections.length
        ? '修改某一节时，用 editor_propose_edit 且 target=section、section=下面的 id。'
        : '文档没有标题；结构改动可考虑 target=text 或 target=document_end。',
    },
  }
}

function readDocument(ctx: ToolCtx, args: Record<string, unknown>): ToolResult {
  const index = docIndexOf(ctx.view)
  const section = strArg(args, 'section') || undefined
  const res = sliceDoc(index, {
    section,
    offset: numArg(args, 'offset'),
    limit: numArg(args, 'limit'),
  })
  if ('error' in res) return { ok: false, message: res.error }
  const data: Record<string, unknown> = {
    section: res.section,
    title: res.title,
    offset: res.offset,
    returned: res.returned,
    total: res.total,
    nextOffset: res.nextOffset,
    truncated: res.truncated,
    text: res.text,
  }
  if (!res.section) data.outline = listSections(index)
  return { ok: true, message: res.note, data }
}

function findText(ctx: ToolCtx, args: Record<string, unknown>): ToolResult {
  const query = strArg(args, 'query')
  if (!query) return { ok: false, message: '缺少 query' }
  const view = ctx.view
  const doc = view.state.doc
  const index = docIndexOf(view)
  const ranges = findTextRanges(doc, query, false)
  if (!ranges.length) {
    const insensitive = findTextRanges(doc, query, true)
    return {
      ok: true,
      message: insensitive.length
        ? `按原样没找到「${query}」，但有 ${insensitive.length} 处大小写不同的匹配；请核对大小写。`
        : `文档中没有「${query}」。`,
      data: { count: 0, caseInsensitiveCount: insensitive.length },
    }
  }
  const size = doc.content.size
  const hits = ranges.slice(0, 20).map((r) => ({
    section: locateSection(index, r.from)?.id ?? null,
    sectionTitle: locateSection(index, r.from)?.title ?? null,
    context: doc.textBetween(Math.max(0, r.from - 40), Math.min(size, r.to + 40), '\n'),
  }))
  return {
    ok: true,
    message: `找到 ${ranges.length} 处「${query}」。${
      ranges.length > 1 ? '若要替换，请改用 target=section，或提供更长的 search 片段以确保唯一。' : ''
    }`,
    data: { count: ranges.length, hits },
  }
}

function getSelection(ctx: ToolCtx): ToolResult {
  const { state } = ctx.view
  const { from, to, empty } = state.selection
  if (empty) {
    const start = Math.max(0, from - 200)
    const end = Math.min(state.doc.content.size, from + 200)
    return {
      ok: true,
      message: '当前没有选中文本。',
      data: {
        empty: true,
        cursorContext: state.doc.textBetween(start, end, '\n'),
      },
    }
  }
  return {
    ok: true,
    message: `已选 ${to - from} 个字符。`,
    data: { empty: false, text: state.doc.textBetween(from, to, '\n') },
  }
}

/* ---------- 写工具（只提议） ---------- */

interface ResolvedTarget {
  from: number
  to: number
  expectedText: string
  label: string
  /** 插入类目标（光标/文末）在 diff 里不显示「原内容」 */
  insertion: boolean
}

function resolveTarget(
  ctx: ToolCtx,
  index: DocIndex,
  args: Record<string, unknown>
): ResolvedTarget | { error: string } {
  const doc = ctx.view.state.doc
  const target = (strArg(args, 'target') || 'selection').trim()
  switch (target) {
    case 'selection': {
      const { from, to } = ctx.view.state.selection
      return {
        from,
        to,
        expectedText: doc.textBetween(from, to, '\n'),
        label: '选中内容',
        insertion: false,
      }
    }
    case 'cursor': {
      const pos = ctx.view.state.selection.to
      return { from: pos, to: pos, expectedText: '', label: '光标处', insertion: true }
    }
    case 'document_end': {
      const pos = doc.content.size
      return { from: pos, to: pos, expectedText: '', label: '文档末尾', insertion: true }
    }
    case 'section': {
      const id = strArg(args, 'section').trim()
      if (!id) return { error: 'target=section 需要带 section（用 editor_get_outline 取 id）' }
      const sec = index.sections.find((s) => s.id === id)
      if (!sec) {
        const ids = index.sections.map((s) => s.id).join(', ') || '（文档没有标题）'
        return { error: `找不到章节 ${id}；可用章节：${ids}` }
      }
      return {
        from: sec.from,
        to: sec.to,
        // 必须用文档真实文本（与 applyProposal 的 doc.textBetween 校验一致）；
        // 索引里的 plain 带 '## ' 前缀，只适合展示，用来校验会永远不相等。
        expectedText: doc.textBetween(sec.from, sec.to, '\n'),
        label: `章节「${sec.title}」`,
        insertion: false,
      }
    }
    case 'text': {
      const search = strArg(args, 'search')
      if (!search) return { error: 'target=text 需要带 search' }
      const ranges = findTextRanges(doc, search, false)
      if (!ranges.length) {
        return {
          error: `未找到原文「${clampText(search, 40)}」。请先用 editor_read / editor_find 核对原文（需与文档逐字一致）。`,
        }
      }
      if (ranges.length > 1) {
        const secs = ranges
          .map((r) => locateSection(index, r.from)?.id)
          .filter((v): v is string => !!v)
        return {
          error: `「${clampText(search, 40)}」在文档里出现了 ${ranges.length} 处（章节 ${
            secs.join(', ') || '不详'
          }）。请改用 target=section，或提供更长的 search 片段。`,
        }
      }
      return { from: ranges[0].from, to: ranges[0].to, expectedText: search, label: `文本「${clampText(search, 18)}」`, insertion: false }
    }
    default:
      return { error: `未知 target：${target}（可选 selection / section / text / document_end / cursor）` }
  }
}

function proposeEdit(ctx: ToolCtx, args: Record<string, unknown>): ToolResult {
  const content = strArg(args, 'content')
  if (!content.trim()) return { ok: false, message: 'content 不能为空' }

  const index = docIndexOf(ctx.view)
  const resolved = resolveTarget(ctx, index, args)
  if ('error' in resolved) return { ok: false, message: resolved.error }

  const slice = parseSlice(ctx, content)
  if (!slice) return { ok: false, message: '新内容解析失败（markdown 语法可能有问题），请换个写法重试' }

  const newText = slice.content.textBetween(0, slice.content.size, '\n', '\n')
  const oldText = resolved.insertion ? '' : resolved.expectedText
  const diff = diffLines(oldText, newText)

  const summary = strArg(args, 'summary').trim()
  const verb = resolved.insertion ? '插入到' : '改写'
  const title = resolved.insertion ? `${verb}${resolved.label}` : `${verb} ${resolved.label}`

  const proposal = addProposal({
    title,
    detail: summary || '（AI 未提供说明）',
    from: resolved.from,
    to: resolved.to,
    expectedText: resolved.expectedText,
    text: content,
    oldText,
    newText,
    diff,
  })
  dedupeProposals()

  return {
    ok: true,
    message: `已提交改动提议「${proposal.title}」（尚未写入，等用户在界面上确认）。`,
    data: {
      status: 'proposed',
      proposalId: proposal.id,
      target: resolved.label,
      stats: proposal.stats,
      note: '本轮到此为止：不要重复提交同一处改动，也不要用文字声称已修改。可以再用一句话向用户说明改了什么。',
    },
  }
}

/* ---------- 入口 ---------- */

/**
 * 执行一次工具调用。未知工具返回明确错误（而不是抛异常），
 * 让 agent loop 能把「这个工具不可用」反馈给模型而不是整条流崩掉。
 */
export function handleEditorTool(
  ctx: ToolCtx,
  name: string,
  rawArgs: unknown
): ToolResult {
  const args = asRecord(rawArgs)
  switch (name) {
    // 新工具集
    case TOOL.GET_OUTLINE:
      return getOutline(ctx)
    case TOOL.READ:
      return readDocument(ctx, args)
    case TOOL.FIND:
      return findText(ctx, args)
    case TOOL.GET_SELECTION:
      return getSelection(ctx)
    case TOOL.PROPOSE_EDIT:
      return proposeEdit(ctx, args)

    // 旧名兼容（不再对外声明，但历史调用不至于报未知工具）
    case TOOL.GET_DOCUMENT:
      return readDocument(ctx, args)
    case TOOL.REPLACE_SELECTION:
    case TOOL.REPLACE_TEXT:
    case TOOL.INSERT_AT_CURSOR:
    case TOOL.INSERT_AT_END:
      return {
        ok: false,
        message: '该工具已废弃：所有正文改动请改用 editor_propose_edit 提交提议。',
      }
    default:
      return { ok: false, message: `未知工具：${name}` }
  }
}

/** 供 UI 复用：当前文档的章节列表（例如给「跳转到章节」用）。 */
export function outlineOf(view: EditorView): ReturnType<typeof listSections> {
  return listSections(docIndexOf(view))
}