/**
 * 本地 Mock LLM：用 OpenAI 兼容的 SSE 流式格式模拟 AI 回复。
 *
 * 仅作为「未配置供应商」时的演示回退（见 ipcProvider.ts）：
 * 一旦用户在设置中添加供应商，真实请求会走主进程 IPC 转发。
 * 保留 mock 的好处是首次打开应用即可体验完整的流式 UI。
 */
import type { XModelParams, XModelResponse } from '@antdv-next/x-sdk'

type MockParams = XModelParams & { model?: string }

/** 按 SSE 格式编码一个 OpenAI 流式 chunk */
function sseChunk(delta: string): Uint8Array {
  const payload = { choices: [{ index: 0, delta: { role: 'assistant', content: delta } }] }
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`)
}

const DONE = new TextEncoder().encode('data: [DONE]\n\n')

/** 把完整回复切成 token 粒度的小块，模拟真实流式输出 */
function splitTokens(text: string, size = 6): string[] {
  const tokens: string[] = []
  for (let i = 0; i < text.length; i += size) tokens.push(text.slice(i, i + size))
  return tokens
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 根据用户输入选择一段演示回复（markdown 全特性，用于展示 XMarkdown） */
function buildReply(userMessage: string): string {
  const text = userMessage.trim().toLowerCase()

  if (/^(你好|您好|hi|hello|hey|在吗)/.test(text)) {
    return [
      '你好！我是 **Muse AI**，Muse 的 AI 助手 👋',
      '',
      '我可以帮你：',
      '',
      '- 总结 / 续写文档内容',
      '- 解释代码，并给出可运行的示例',
      '- 把想法整理成结构化的 markdown',
      '',
      '> 当前为 **本地演示模式**：回复由内置模板模拟，接入真实大模型 API 后即可体验流式输出。',
      '',
      '试试问我「写一段 Vue 代码」或「介绍一下 Muse 的架构」～',
    ].join('\n')
  }

  if (/写|代码|code|函数|实现|demo/.test(text)) {
    return [
      '好的，给你一段 **Vue 3 + TypeScript** 的计数器组件：',
      '',
      '```ts',
      "import { ref } from 'vue'",
      '',
      'export function useCounter(initial = 0) {',
      '  const count = ref(initial)',
      '  const inc = (step = 1) => (count.value += step)',
      '  const reset = () => (count.value = initial)',
      '  return { count, inc, reset }',
      '}',
      '```',
      '',
      '在组件里这样用：',
      '',
      '```vue',
      '<script setup lang="ts">',
      "import { useCounter } from './useCounter'",
      '',
      'const { count, inc, reset } = useCounter(10)',
      '</script>',
      '',
      '<template>',
      '  <button @click="inc()">+1</button>',
      '  <span>{{ count }}</span>',
      '  <button @click="reset()">reset</button>',
      '</template>',
      '```',
      '',
      '两种写法的对比：',
      '',
      '| 写法 | 组合式 API | 选项式 API |',
      '| --- | --- | --- |',
      '| 逻辑复用 | ✅ 天然支持 | ❌ 需要 mixin |',
      '| 类型推导 | ✅ 优秀 | ⚠️ 一般 |',
      '| 上手难度 | 中等 | 低 |',
      '',
      '需要我展开讲某个点吗？',
    ].join('\n')
  }

  if (/架构|arch|设计|plan|muse/.test(text)) {
    return [
      '## Muse 的技术架构',
      '',
      'Muse 是一个 **Electron + Vue 3** 桌面应用，核心链路如下：',
      '',
      '1. **编辑器内核** — Milkdown 7（ProseMirror），开箱即 WYSIWYG markdown',
      '2. **代码高亮** — Shiki 4 单例 highlighter，代码块失焦 / 防抖重渲染',
      '3. **AI 对话** — 本页即 Phase 5 的雏形：`@antdv-next/x` 全家桶 + `x-sdk` 流式管线',
      '',
      '> 项目名 **Muse** 的真正含义是 AI 流式输出 —— 像灵感一样逐字涌现。',
      '',
      '```mermaid',
      'flowchart LR',
      '  A[输入] --> B[Milkdown]',
      '  A --> C[AI Chat]',
      '  B --> D[Shiki 高亮]',
      '  C --> E[x-sdk 流式]',
      '  D --> F[渲染]',
      '  E --> F',
      '```',
    ].join('\n')
  }

  return [
    `收到你的消息：**${userMessage.trim().slice(0, 60)}**`,
    '',
    '这是一段由内置模板生成的 markdown 演示，覆盖了常见排版：',
    '',
    '## 标题层级',
    '',
    '**加粗**、*斜体*、`行内代码`、~~删除线~~ 与 [链接](https://github.com/CarlOpenLab/muse)。',
    '',
    '### 列表',
    '',
    '1. 第一项',
    '2. 第二项',
    '   - 嵌套子项 A',
    '   - 嵌套子项 B',
    '',
    '### 代码块',
    '',
    '```js',
    "const muse = { editor: 'WYSIWYG', ai: 'streaming' }",
    'console.log(muse)',
    '```',
    '',
    '### 引用',
    '',
    '> AI 流式输出是 Muse 的主线。',
    '',
    '当前是本地模拟回复，接入真实模型后我会给出更专业的答案。',
  ].join('\n')
}

/** 模拟 OpenAI /chat/completions 的 SSE 流式响应 */
export function mockChatFetch(
  _baseURL: string | URL | Request,
  _options: RequestInit
): Promise<Response> {
  // 从请求体里取出最后一条用户消息
  let userMessage = '你好'
  let hasTools = false
  let hasToolResult = false
  try {
    const bodyText = String((_options as { body?: string }).body ?? '')
    const body = JSON.parse(bodyText)
    const messages: { role?: string; content?: unknown }[] = body?.messages ?? []
    const last = [...messages].reverse().find((m) => m.role === 'user')
    if (last && typeof last.content === 'string') userMessage = last.content
    hasTools = Array.isArray(body?.tools) && body.tools.length > 0
    hasToolResult = messages.some((m) => m.role === 'tool')
  } catch {
    /* ignore */
  }

  // 工具调用演示：带 tools 且用户有修改意图时，第一轮返回 tool_calls（agent loop 会真改文档），
  // 工具结果返回后的第二轮给出总结文本。
  const DEMO_TOOL_CONTENT = [
    '## 由 Muse AI 演示添加',
    '',
    '> 这是 **工具调用** 的演示——AI 直接修改了你的文档。',
    '> 接入真实大模型后，你可以让我润色、替换、增删任意内容。',
  ].join('\n')
  const TOOL_INTENT = /修改|替换|改|添加|追加|插入|删除|编辑|润色|总结|翻译|扩写/
  if (hasTools && !hasToolResult && TOOL_INTENT.test(userMessage)) {
    const toolCallEvent = JSON.stringify({
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: 'call_mock_1',
                type: 'function',
                function: {
                  name: 'editor_insert_at_end',
                  arguments: JSON.stringify({ content: DEMO_TOOL_CONTENT }),
                },
              },
            ],
          },
        },
      ],
    })
    const finishEvent = JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })
    const bytes = [
      `data: ${toolCallEvent}\n\n`,
      `data: ${finishEvent}\n\n`,
      'data: [DONE]\n\n',
    ].join('')
    return Promise.resolve(
      new Response(new Blob([bytes]).stream(), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      })
    )
  }

  if (hasToolResult) {
    // 工具已执行完毕的收尾轮：说明结果
    const reply = [
      '✅ 已通过 **工具调用** 修改文档（本地演示）：在文末追加了一段演示内容。',
      '',
      '接入真实大模型后，你可以直接说「把 XX 改成 YY」「补充一段关于 Z 的」「修正错别字」，我会用工具直接改好，⌘Z 随时可撤销。',
    ].join('\n')
    const tokens = splitTokens(reply)
    let index = 0
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const push = async () => {
          while (index < tokens.length && !cancelled) {
            controller.enqueue(sseChunk(tokens[index]))
            index += 1
            await sleep(40 + Math.random() * 60)
          }
          if (!cancelled) controller.enqueue(DONE)
          controller.close()
        }
        void push()
      },
      cancel() {
        cancelled = true
      },
    })
    return Promise.resolve(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      })
    )
  }

  const reply = buildReply(userMessage)
  const tokens = splitTokens(reply)
  let index = 0
  let cancelled = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = async () => {
        while (index < tokens.length && !cancelled) {
          controller.enqueue(sseChunk(tokens[index]))
          index += 1
          await sleep(40 + Math.random() * 60)
        }
        if (!cancelled) controller.enqueue(DONE)
        controller.close()
      }
      void push()
    },
    cancel() {
      cancelled = true
    },
  })

  return Promise.resolve(
    new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    })
  )
}

/** Mock 请求参数类型：兼容 OpenAI 风格 */
export type { MockParams }
