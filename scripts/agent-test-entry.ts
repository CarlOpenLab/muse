/**
 * agent loop 核心逻辑集成测试入口（由 test-agent.mjs 打包后 Node 直跑）。
 * 验证真实源码：processSseText 解析 + mock 工具调用演示流。
 */
import { processSseText } from '../src/chat/ipcProvider'
import { mockChatFetch } from '../src/chat/mockProvider'

async function main(): Promise<void> {
  let pass = 0
  let fail = 0
  const check = (name: string, cond: boolean, extra = ''): void => {
    if (cond) {
      pass++
      console.log(`  ✓ ${name}`)
    } else {
      fail++
      console.log(`  ✗ ${name} ${extra}`)
    }
  }

const emptyAcc = () => ({
  contentEvents: [] as string[],
  toolCalls: [] as { id: string; name: string; arguments: string }[],
  thinking: '',
})

console.log('== processSseText: 纯文本流 ==')
{
  const acc = emptyAcc()
  processSseText({ s: '' }, 'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n', acc)
  check('提取 content 事件', acc.contentEvents.length === 1 && acc.contentEvents[0].includes('你好'))
  check('无 tool_calls', acc.toolCalls.length === 0)
}

console.log('== processSseText: tool_calls 增量拼接（跨 chunk）==')
{
  const acc = emptyAcc()
  processSseText(
    { s: '' },
    'data: {"choices":[{"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_1","function":{"name":"editor_insert_at_end","arguments":"{\\"content\\":"}}]}}]}\n\n',
    acc
  )
  processSseText(
    { s: '' },
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"hi\\"}"}}]}}]}\n\n',
    acc
  )
  check('拼接出完整 id', acc.toolCalls[0]?.id === 'call_1')
  check('拼接出完整 name', acc.toolCalls[0]?.name === 'editor_insert_at_end')
  check('arguments 增量拼接为合法 JSON', (JSON.parse(acc.toolCalls[0]?.arguments ?? '') as { content: string })?.content === 'hi')
}

console.log('== processSseText: 事件跨 chunk 边界 ==')
{
  const acc = emptyAcc()
  const buf = { s: '' }
  processSseText(buf, 'data: {"choices":[{"delta":{"content":"甲"}}]}\n\ndata: {"choices":[{"d', acc)
  processSseText(buf, 'elta":{"content":"乙"}}]}\n\n', acc)
  const joined = acc.contentEvents.join('')
  check('两个事件都解析', acc.contentEvents.length === 2)
  check('内容正确', joined.includes('甲') && joined.includes('乙'))
}

console.log('== mock 工具演示流（带 tools + 修改意图）==')
async function readResponse(res: Response): Promise<string> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out += decoder.decode(value, { stream: true })
  }
  return out
}

{
  const body = JSON.stringify({
    model: 'muse-mock',
    stream: true,
    tools: [{ type: 'function', function: { name: 'editor_insert_at_end' } }],
    messages: [{ role: 'user', content: '帮我在文末添加一段总结' }],
  })
  const res = await mockChatFetch('', { body } as RequestInit)
  const raw = await readResponse(res)
  const acc = emptyAcc()
  processSseText({ s: '' }, raw, acc)
  check('解析出 tool_calls', acc.toolCalls.length === 1)
  check('工具名正确', acc.toolCalls[0]?.name === 'editor_insert_at_end')
  const args = JSON.parse(acc.toolCalls[0]?.arguments ?? '{}') as { content: string }
  check('参数含 content 且非空', Boolean(args.content?.length))
}

console.log('== mock 工具收尾轮（已带 tool 结果 → 纯文本总结）==')
{
  const body = JSON.stringify({
    model: 'muse-mock',
    stream: true,
    tools: [{ type: 'function', function: { name: 'editor_insert_at_end' } }],
    messages: [
      { role: 'user', content: '帮我在文末添加一段总结' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'call_mock_1', type: 'function', function: { name: 'editor_insert_at_end', arguments: '{"content":"x"}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_mock_1', content: '{"ok":true}' },
    ],
  })
  const res = await mockChatFetch('', { body } as RequestInit)
  const raw = await readResponse(res)
  const acc = emptyAcc()
  processSseText({ s: '' }, raw, acc)
  check('无 tool_calls（避免死循环）', acc.toolCalls.length === 0)
  check('有内容文本', acc.contentEvents.length > 0)
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`)
process.exit(fail ? 1 : 0)
}

void main()
