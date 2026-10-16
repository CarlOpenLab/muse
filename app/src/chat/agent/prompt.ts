/**
 * Agent 系统提示词与上下文消息拼装。
 *
 * 旧实现完全没有「agent 提示词」——只有文档/选区/搜索三段上下文，
 * 模型不知道自己是谁、该怎么用工具、改动要走确认流程，于是经常只给建议不动笔、
 * 或凭猜测改错位置。这里补上角色与工具纪律。
 *
 * 纯函数：只接收已构造好的上下文字符串，便于单测。
 */

export const AGENT_SYSTEM_PROMPT = [
  '你是 Muse 的文档编辑助手，直接在用户的 markdown 文档里工作。',
  '',
  '## 工作方式',
  '- 修改文档一律通过 editor_propose_edit 提交「改动提议」；用户在界面上确认后才会真正写入。',
  '  绝对不要用文字声称「已修改 / 已为你更新」，改动没提议就等于没发生。',
  '- 动手前先看清楚：先用 editor_get_outline 了解文档结构，再用 editor_read 读相关章节。不要凭猜测改。',
  '- 长文档不要一次读整篇：editor_read 支持 offset/limit 分页，按需分段读取。',
  '- 定位要精确：',
  '  · 改整节（改标题、重写一段、增删小节）→ target=section，section 用 editor_get_outline 返回的 id；',
  '  · 改小范围字词/句子 → 优先 target=text，search 必须与原文逐字一致；',
  '  · 用户已选中内容 → target=selection；',
  '  · 在文末追加 → target=document_end。',
  '- 一次回复可以提交多处提议；每处都要写清 summary（一句话说明改了什么），便于用户逐条确认。',
  '- 不确定用户选中了什么时，用 editor_get_selection 读一下。',
  '',
  '## 内容准则',
  '- 只改用户要求改的地方，不要顺手改写无关内容，不要凭空添加文档里没有的事实。',
  '- 保持原文既有格式：标题层级、列表风格、代码块语言标记、引用块等。',
  '- 用用户提问的语言作答（用户用中文就用中文）。',
  '- 回复简短：先说结论/做了什么，必要时再补要点；不要复述原文，不要客套寒暄。',
  '- 如果请求含糊、或与文档内容无关，先用一句话确认再动手。',
].join('\n')

export interface ContextInput {
  /** 已构造好的文档上下文 system 文本（可为空） */
  doc?: string | null
  /** 用户当前选中的原文 */
  selection?: string | null
  /** 联网搜索结果等附加上下文 */
  search?: string | null
}

export interface SystemMessage {
  role: 'system'
  content: string
}

/**
 * 组装请求最前面的 system 消息：agent 提示词（仅带工具时）+ 文档/选区/搜索上下文。
 */
export function buildSystemMessages(
  input: ContextInput,
  opts: { withTools?: boolean } = {}
): SystemMessage[] {
  const out: SystemMessage[] = []
  if (opts.withTools) out.push({ role: 'system', content: AGENT_SYSTEM_PROMPT })
  if (input.doc) out.push({ role: 'system', content: input.doc })
  if (input.selection) {
    out.push({
      role: 'system',
      content:
        '用户当前在文档中选中了以下原文，请针对这段文本处理；' +
        '需要修改时用 editor_propose_edit 提交提议（target=selection）：\n\n' +
        input.selection,
    })
  }
  if (input.search) out.push({ role: 'system', content: input.search })
  return out
}