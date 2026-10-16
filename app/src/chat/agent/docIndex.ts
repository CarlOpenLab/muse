/**
 * 文档索引：把编辑器的顶层块拍平成「纯文本 + 章节表」，供 AI 读取与定位。
 *
 * 输入是已拍平的块数组（编辑器侧负责把 ProseMirror 节点转成 FlatBlock），
 * 输出到这一步为止都是纯函数，可以用 `node --test` 直接测。
 *
 * 为什么需要它：旧的 editor_get_document 会把长文超长部分**静默截断**，
 * 模型却当成全文用，于是长文档必然改错位置。这里把「读」拆成
 * outline（看结构）+ 分页 read（按需读）+ 章节定位（改结构用 id 而不是猜字符串）。
 */

export interface FlatBlock {
  kind: 'heading' | 'block'
  /** 标题层级；非标题为 0 */
  level: number
  text: string
  /** 编辑器内的节点起点（ProseMirror 位置） */
  from: number
  /** 编辑器内的节点终点（ProseMirror 位置，不含） */
  to: number
}

export interface SectionSpan {
  /** 稳定 id，形如 s3（第 3 个顶层块是标题）；同一次构建内确定 */
  id: string
  level: number
  title: string
  from: number
  to: number
  /** 在 plain 文本中的起止下标 */
  charStart: number
  charEnd: number
}

export interface DocIndex {
  plain: string
  blocks: FlatBlock[]
  sections: SectionSpan[]
  charCount: number
  lineCount: number
}

export const DEFAULT_READ_LIMIT = 4000
export const MAX_READ_LIMIT = 12000

/** 由块数组构建索引（含 plain 文本与章节区间）。 */
export function buildDocIndex(blocks: FlatBlock[]): DocIndex {
  const lines: string[] = []
  const spans: { charStart: number; charEnd: number }[] = []
  let cursor = 0
  for (const b of blocks) {
    const line = b.kind === 'heading' ? `${'#'.repeat(Math.max(1, b.level))} ${b.text}` : b.text
    spans.push({ charStart: cursor, charEnd: cursor + line.length })
    lines.push(line)
    cursor += line.length + 1 // 行间 '\n'
  }
  const plain = lines.join('\n')

  const sections: SectionSpan[] = []
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    if (b.kind !== 'heading') continue
    // 章节到下一个「同级或更高级」标题为止
    let end = blocks.length
    for (let j = i + 1; j < blocks.length; j++) {
      const nb = blocks[j]
      if (nb.kind === 'heading' && nb.level <= b.level) {
        end = j
        break
      }
    }
    sections.push({
      id: `s${i + 1}`,
      level: b.level,
      title: b.text,
      from: b.from,
      to: end < blocks.length ? blocks[end].from : blocks[blocks.length - 1]?.to ?? b.to,
      charStart: spans[i].charStart,
      charEnd: end < blocks.length ? spans[end].charStart - 1 : plain.length,
    })
  }

  return { plain, blocks, sections, charCount: plain.length, lineCount: lines.length }
}

export interface SectionListItem {
  id: string
  level: number
  title: string
  chars: number
}

export function listSections(index: DocIndex): SectionListItem[] {
  return index.sections.map((s) => ({
    id: s.id,
    level: s.level,
    title: s.title,
    chars: s.charEnd - s.charStart,
  }))
}

/** 给定编辑器位置，找它落在哪个章节里（嵌套时取最靠内的一节）。 */
export function locateSection(index: DocIndex, pos: number): SectionSpan | null {
  let hit: SectionSpan | null = null
  for (const s of index.sections) {
    if (pos >= s.from && pos < s.to) hit = s
  }
  return hit
}

export interface ReadResult {
  text: string
  /** 本次读取所属章节；读整篇时为 null */
  section: string | null
  title: string | null
  offset: number
  returned: number
  total: number
  /** 还有后续内容时给出下一次应传的 offset；否则 null */
  nextOffset: number | null
  truncated: boolean
  note: string
}

export type SliceOutcome = ReadResult | { error: string }

/** 读文档：可整篇分页，也可只读某个章节。 */
export function sliceDoc(
  index: DocIndex,
  opts: { section?: string; offset?: number; limit?: number } = {}
): SliceOutcome {
  let base = 0
  let total = index.charCount
  let sectionId: string | null = null
  let title: string | null = null

  if (opts.section) {
    const sec = index.sections.find((s) => s.id === opts.section)
    if (!sec) {
      const ids = index.sections.map((s) => s.id).join(', ') || '（文档没有标题）'
      return { error: `找不到章节 ${opts.section}；可用章节：${ids}` }
    }
    base = sec.charStart
    total = sec.charEnd - sec.charStart
    sectionId = sec.id
    title = sec.title
  }

  const offset = Math.max(0, Math.floor(opts.offset ?? 0))
  const rawLimit = Math.floor(opts.limit ?? DEFAULT_READ_LIMIT)
  const limit = Math.min(MAX_READ_LIMIT, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_READ_LIMIT))

  if (total === 0) {
    return {
      text: '',
      section: sectionId,
      title,
      offset: 0,
      returned: 0,
      total: 0,
      nextOffset: null,
      truncated: false,
      note: '目标内容为空。',
    }
  }
  if (offset >= total) {
    return { error: `offset ${offset} 超出范围（本段共 ${total} 字符）` }
  }
  const end = Math.min(total, offset + limit)
  const text = index.plain.slice(base + offset, base + end)
  const nextOffset = end < total ? end : null
  return {
    text,
    section: sectionId,
    title,
    offset,
    returned: text.length,
    total,
    nextOffset,
    truncated: nextOffset !== null,
    note:
      nextOffset !== null
        ? `本次返回第 ${offset}–${end} 字符（共 ${total}）。需要后续内容请再调 editor_read 并传 offset=${nextOffset}。`
        : `已返回全部 ${total} 字符。`,
  }
}