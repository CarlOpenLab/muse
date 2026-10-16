/**
 * AI 可调用的编辑器工具声明（OpenAI function calling 格式）与展示元数据。
 *
 * 对比旧版的两处关键改动：
 * - 「读」拆成三件：get_outline（看结构）/ read（按章节或分页读）/ find（定位文本），
 *   取代旧版那个会把长文**静默截断**的 get_document（模型误当全文用 → 长文必改错）。
 * - 「写」收敛成一件：propose_edit —— 只提交改动提议，用户在界面确认后才落地。
 */

export interface ToolResult {
  ok: boolean
  message: string
  data?: unknown
}

export interface ChatTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export const TOOL = {
  // 读
  GET_OUTLINE: 'editor_get_outline',
  READ: 'editor_read',
  FIND: 'editor_find',
  GET_SELECTION: 'editor_get_selection',
  // 写（只提议，不直接落笔）
  PROPOSE_EDIT: 'editor_propose_edit',
  // 旧名保留：执行器仍认这些名字（向后兼容），但不再对外声明
  GET_DOCUMENT: 'editor_get_document',
  REPLACE_SELECTION: 'editor_replace_selection',
  INSERT_AT_CURSOR: 'editor_insert_at_cursor',
  INSERT_AT_END: 'editor_insert_at_end',
  REPLACE_TEXT: 'editor_replace_text',
} as const

export const TOOL_LABEL: Record<string, string> = {
  [TOOL.GET_OUTLINE]: '查看大纲',
  [TOOL.READ]: '阅读文档',
  [TOOL.FIND]: '查找文本',
  [TOOL.GET_SELECTION]: '读取选区',
  [TOOL.PROPOSE_EDIT]: '提交改动提议',
  [TOOL.GET_DOCUMENT]: '读取文档',
  [TOOL.REPLACE_SELECTION]: '替换选区',
  [TOOL.INSERT_AT_CURSOR]: '光标处插入',
  [TOOL.INSERT_AT_END]: '文末追加',
  [TOOL.REPLACE_TEXT]: '替换文本',
}

function clamp(text: string, max = 24): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** 工具调用的一行摘要，用于思维链里展示「它到底做了什么」。 */
export function toolArgsSummary(name: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>
  const s = (k: string): string => (typeof a[k] === 'string' ? (a[k] as string) : '')
  switch (name) {
    case TOOL.READ: {
      const parts: string[] = []
      if (s('section')) parts.push(`章节 ${s('section')}`)
      if (a.offset != null) parts.push(`offset=${a.offset}`)
      if (a.limit != null) parts.push(`limit=${a.limit}`)
      return parts.join(' · ') || '全文'
    }
    case TOOL.FIND:
      return s('query') ? `「${clamp(s('query'), 30)}」` : ''
    case TOOL.PROPOSE_EDIT: {
      const target = s('target') || 'selection'
      const where =
        target === 'section'
          ? `章节 ${s('section')}`
          : target === 'text'
            ? `文本「${clamp(s('search'), 20)}」`
            : target === 'document_end'
              ? '文末'
              : target === 'cursor'
                ? '光标处'
                : '选区'
      return s('summary') ? `${where} · ${clamp(s('summary'), 40)}` : where
    }
    case TOOL.REPLACE_TEXT:
      return s('search') ? `「${clamp(s('search'), 20)}」` : ''
    case TOOL.GET_OUTLINE:
    case TOOL.GET_SELECTION:
    case TOOL.GET_DOCUMENT:
      return ''
    default:
      return ''
  }
}

/** 声明给模型的工具集（顺序影响不大，但读放前、写放后更符合使用习惯）。 */
export const EDITOR_TOOLS: ChatTool[] = [
  {
    type: 'function',
    function: {
      name: TOOL.GET_OUTLINE,
      description:
        '查看当前文档的大纲：标题层级、各章节 id 与字符数。修改文档前应先调用它了解结构。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL.READ,
      description:
        '读取文档内容。可整篇读（支持 offset/limit 分页，避免一次读入过长文本），也可只读某一章节（传 section）。返回里会说明是否还有后续内容以及下次该传的 offset。',
      parameters: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            description: '要读取的章节 id（如 s3，来自 editor_get_outline）；省略则读整篇',
          },
          offset: { type: 'integer', description: '起始字符偏移，默认 0' },
          limit: { type: 'integer', description: '本次最多返回的字符数，默认 4000，上限 12000' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL.FIND,
      description:
        '在文档中查找文本，返回出现次数、所在章节与上下文片段。用于在改字词前确认原文与位置。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '要查找的原文片段' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL.GET_SELECTION,
      description: '读取用户当前选中的文字（无选区时返回光标附近的上下文）。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL.PROPOSE_EDIT,
      description:
        '提交一处文档改动提议。改动不会立刻写入，用户在界面上确认后才落地。所有对正文的修改都必须通过它。',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            enum: ['section', 'text', 'selection', 'document_end', 'cursor'],
            description:
              '改动目标：section=整节（配 section）；text=按原文精确匹配（配 search）；selection=当前选中；document_end=文末追加；cursor=光标处插入',
          },
          section: { type: 'string', description: 'target=section 时必填，如 s3' },
          search: {
            type: 'string',
            description: 'target=text 时必填，要与文档中的原文逐字一致；若出现多处会报错，请改用 section 或更长的片段',
          },
          content: {
            type: 'string',
            description:
              '新内容（markdown）。target=document_end 或 cursor 时表示要插入的内容；其余为替换后的内容。',
          },
          summary: { type: 'string', description: '一句话说明这处改动做了什么，会显示在确认卡片上' },
        },
        required: ['target', 'content'],
      },
    },
  },
]