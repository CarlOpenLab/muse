import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyToolCallDelta,
  compactToolCalls,
  parseToolArguments,
  validateToolCall,
} from '../toolCall'

test('parseToolArguments：空/undefined → 空对象', () => {
  assert.deepEqual(parseToolArguments(''), { ok: true, args: {} })
  assert.deepEqual(parseToolArguments(undefined), { ok: true, args: {} })
  assert.deepEqual(parseToolArguments(null), { ok: true, args: {} })
})

test('parseToolArguments：坏 JSON 不抛异常，返回错误（旧实现会让整条流崩掉）', () => {
  const res = parseToolArguments('{"content": "没写完')
  assert.equal(res.ok, false)
  if (res.ok) return
  assert.match(res.error, /合法 JSON/)
})

test('parseToolArguments：合法 JSON 但非对象 → 报错', () => {
  assert.equal(parseToolArguments('[1,2]').ok, false)
  assert.equal(parseToolArguments('42').ok, false)
  assert.equal(parseToolArguments('"str"').ok, false)
})

test('parseToolArguments：对象字符串正常解析', () => {
  const res = parseToolArguments('{"target":"section","section":"s3"}')
  assert.equal(res.ok, true)
  if (!res.ok) return
  assert.equal(res.args.section, 's3')
})

test('applyToolCallDelta：id/name 只取第一次，arguments 逐段拼接', () => {
  const accs: Array<{ id: string; name: string; arguments: string }> = []
  applyToolCallDelta(accs, [{ index: 0, id: 'call_1', function: { name: 'editor_read' } }])
  applyToolCallDelta(accs, [{ index: 0, id: 'call_1', function: { arguments: '{"sec' } }])
  applyToolCallDelta(accs, [{ index: 0, id: 'call_1', function: { arguments: 'tion":"s2"}' } }])
  assert.equal(accs[0].id, 'call_1')
  assert.equal(accs[0].name, 'editor_read')
  assert.equal(accs[0].arguments, '{"section":"s2"}')
})

test('applyToolCallDelta：多路 index 各自归位', () => {
  const accs: Array<{ id: string; name: string; arguments: string }> = []
  applyToolCallDelta(accs, [
    { index: 0, id: 'a', function: { name: 'editor_get_outline' } },
    { index: 1, id: 'b', function: { name: 'editor_find', arguments: '{"query":"x"}' } },
  ])
  assert.equal(accs[0].name, 'editor_get_outline')
  assert.equal(accs[1].name, 'editor_find')
  assert.equal(accs.length, 2)
})

test('validateToolCall：缺 name / 缺 id 都要拦下', () => {
  assert.equal(validateToolCall({ id: 'a', name: 'editor_read', arguments: '{}' }), null)
  assert.match(validateToolCall({ id: 'a', name: '', arguments: '{}' }) ?? '', /name/)
  assert.match(validateToolCall({ id: '', name: 'editor_read', arguments: '{}' }) ?? '', /id/)
})

test('compactToolCalls：过滤稀疏空位', () => {
  const accs: Array<{ id: string; name: string; arguments: string }> = [
    { id: 'a', name: 'editor_read', arguments: '{}' },
  ]
  // 制造稀疏下标（增量流可能按 index 跳着写）
  accs[4] = { id: 'b', name: 'editor_find', arguments: '{}' }
  const out = compactToolCalls(accs)
  assert.equal(out.length, 2)
  assert.deepEqual(
    out.map((a) => a.name),
    ['editor_read', 'editor_find']
  )
})