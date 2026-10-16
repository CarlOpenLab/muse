import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffLines, diffWords, summarizeDiff } from '../diff'

test('两段完全相同 → 全是 same，changed=false', () => {
  const lines = diffLines('a\nb\nc', 'a\nb\nc')
  assert.deepEqual(
    lines.map((l) => l.type),
    ['same', 'same', 'same']
  )
  assert.equal(summarizeDiff(lines).changed, false)
  assert.equal(summarizeDiff(lines).unchanged, 3)
})

test('单行改写 → 一 del 一 add，且带行内词级 segments', () => {
  const lines = diffLines('hello world', 'hello there')
  assert.deepEqual(
    lines.map((l) => l.type),
    ['del', 'add']
  )
  const del = lines[0]
  const add = lines[1]
  // del 侧不应含 add 片段，反之亦然
  assert.ok(del.segments?.every((s) => s.type !== 'add'))
  assert.ok(add.segments?.every((s) => s.type !== 'del'))
  // "hello " 是共有的
  assert.ok(del.segments?.some((s) => s.type === 'same' && s.text.includes('hello')))
})

test('新增行 → add，oldNo 为 null；删除行 → del，newNo 为 null', () => {
  const lines = diffLines('one\ntwo', 'one\ninserted\ntwo')
  const added = lines.filter((l) => l.type === 'add')
  assert.equal(added.length, 1)
  assert.equal(added[0].text, 'inserted')
  assert.equal(added[0].oldNo, null)
  assert.equal(added[0].newNo, 2)
  const same = lines.filter((l) => l.type === 'same')
  assert.deepEqual(
    same.map((l) => l.text),
    ['one', 'two']
  )
})

test('行号连续且正确', () => {
  const lines = diffLines('a\nb\nc', 'a\nB\nc')
  const byText = new Map(lines.map((l) => [`${l.type}:${l.text}`, l]))
  assert.equal(byText.get('del:b')?.oldNo, 2)
  assert.equal(byText.get('del:b')?.newNo, null)
  assert.equal(byText.get('add:B')?.newNo, 2)
  assert.equal(byText.get('add:B')?.oldNo, null)
  assert.equal(byText.get('same:c')?.oldNo, 3)
  assert.equal(byText.get('same:c')?.newNo, 3)
})

test('summarizeDiff 统计增删改', () => {
  const s = summarizeDiff(diffLines('a\nb\nc\nd', 'a\nX\nc\nd\ne'))
  assert.equal(s.removed, 1)
  assert.equal(s.added, 2)
  assert.equal(s.unchanged, 3)
  assert.equal(s.changed, true)
})

test('diffWords 相同则单段 same；空串安全', () => {
  assert.deepEqual(diffWords('abc', 'abc'), [{ type: 'same', text: 'abc' }])
  assert.deepEqual(diffWords('', ''), [])
  const segs = diffWords('the quick fox', 'the slow fox')
  assert.equal(segs.map((s) => s.type).join(','), 'same,del,add,same')
})

test('大输入退化路径不抛异常（整段替换）', () => {
  const big = Array.from({ length: 3000 }, (_, i) => `line ${i} alpha`).join('\n')
  const big2 = Array.from({ length: 3000 }, (_, i) => `line ${i} beta`).join('\n')
  const lines = diffLines(big, big2)
  const s = summarizeDiff(lines)
  assert.equal(s.changed, true)
  assert.ok(s.added > 0 && s.removed > 0)
})