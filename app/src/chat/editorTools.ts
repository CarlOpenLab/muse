/**
 * AI 可直接操作的文档编辑工具（OpenAI function calling 声明）。
 *
 * 侧边栏 AI 是「文档辅助」定位：模型通过工具调用直接修改当前文档，
 * 而不是只返回文本让用户手动处理。工具在渲染进程注册，执行走
 * editor action 管线（MilkdownCore 持有 editor 实例），修改可 ⌘Z 撤销。
 */

export interface ToolResult {
  ok: boolean
  message: string
  data?: Record<string, unknown>
}

export const TOOL = {
  GET_DOCUMENT: 'editor_get_document',
  GET_SELECTION: 'editor_get_selection',
  REPLACE_SELECTION: 'editor_replace_selection',
  INSERT_AT_CURSOR: 'editor_insert_at_cursor',
  INSERT_AT_END: 'editor_insert_at_end',
  REPLACE_TEXT: 'editor_replace_text',
} as const

/** 工具中文可读名（ThoughtChain 节点标题用） */
export const TOOL_LABEL: Record<string, string> = {
  [TOOL.GET_DOCUMENT]: '读取文档',
  [TOOL.GET_SELECTION]: '读取选中内容',
  [TOOL.REPLACE_SELECTION]: '替换选中内容',
  [TOOL.INSERT_AT_CURSOR]: '插入到光标处',
  [TOOL.INSERT_AT_END]: '追加到文末',
  [TOOL.REPLACE_TEXT]: '全文查找替换',
}

/** 从工具参数提炼一行摘要（思考链节点描述用） */
export function toolArgsSummary(args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>
  const content = typeof a.content === 'string' ? a.content : ''
  const search = typeof a.search === 'string' ? a.search : ''
  if (search) return `「${search}」`
  if (content) return content.length > 18 ? `${content.slice(0, 18)}…` : content
  return ''
}

export type ChatTool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

export const EDITOR_TOOLS: ChatTool[] = [
  {
    type: 'function',
    function: {
      name: TOOL.GET_DOCUMENT,
      description:
        '读取当前文档：返回标题结构与全文文本。当用户要求修改文档但未选中具体内容时，先调用它了解文档再动手。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL.GET_SELECTION,
      description:
        '读取编辑器当前选中的文字。用户说「这段 / 选中部分 / 上面这段」时调用；无选区时返回光标附近的上下文。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL.REPLACE_SELECTION,
      description:
        '用新内容替换编辑器当前选中的文字（markdown 语法会被解析成实际格式）。无选区时等同于在光标处插入。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '替换后的 markdown 内容' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL.INSERT_AT_CURSOR,
      description: '在光标位置插入 markdown 内容。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '要插入的 markdown 内容' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL.INSERT_AT_END,
      description: '在文档末尾追加 markdown 内容（用于补充分节、总结、参考资料等）。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '要追加的 markdown 内容' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: TOOL.REPLACE_TEXT,
      description:
        '在全文查找一段文本并替换（普通字符串精确匹配，非正则）。用于「把 XX 改成 YY」「修正拼写」这类修改。',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: '要查找的原文（精确匹配）' },
          content: { type: 'string', description: '替换成的文本' },
          replaceAll: { type: 'boolean', description: '是否替换全部匹配（默认只替换第一处）' },
        },
        required: ['search', 'content'],
      },
    },
  },
]
