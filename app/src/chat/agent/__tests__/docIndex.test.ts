import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDocIndex,
  listSections,
  locateSection,
  sliceDoc,
  type FlatBlock,
} from '../docIndex'

/** 造几个块：位置只用来演示，不需要真的对齐 ProseMirror。 */
function blocks(): FlatBlock[] {
  return [
    { kind: 'heading', level: 1, text: '标题一', from: 0, to: 5 },
    { kind: 'block', level: 0, text: '第一段文字', from: 5, to: 20 },
    { kind: 'heading', level: 2, text: '小节 A', from: 20, to: 26 },
    { kind: 'block', level: 0, text: 'A 的内容', from: 26, to: 40 },
    { kind: 'heading', level: 2, text: '小节 B', from: 40, to: 46 },
    { kind: 'block', level: 0, text: 'B 的内容', from: 46, to: 60 },
    { kind: 'heading', level: 1, text: '标题二', from: 60, to: 65 },
    { kind: 'block', level: 0, text: '末尾段', from: 65, to: 75 },
  ]
}

test('buildDocIndex 把标题渲染成 # 前缀，plain 文本正确', () => {
  const idx = buildDocIndex(blocks())
  assert.equal(
    idx.plain,
    ['# 标题一', '第一段文字', '## 小节 A', 'A 的内容', '## 小节 B', 'B 的内容', '# 标题二', '末尾段'].join(
      '\n'
    )
  )
  assert.equal(idx.lineCount, 8)
  assert.equal(idx.charCount, idx.plain.length)
})

test('章节划分：一级标题吃掉同级的下一节之前的所有内容', () => {
  const idx = buildDocIndex(blocks())
  const sections = listSections(idx)
  assert.deepEqual(
    sections.map((s) => s.id),
    ['s1', 's3', 's5', 's7']
  )
  // s1（# 标题一）应一直延伸到 # 标题二 之前，含两个二级小节
  const s1 = idx.sections[0]
  assert.ok(s1.charEnd <= idx.plain.indexOf('\n# 标题二') + 1)
  assert.ok(idx.plain.slice(s1.charStart, s1.charEnd).includes('## 小节 A'))
  assert.ok(idx.plain.slice(s1.charStart, s1.charEnd).includes('## 小节 B'))
  // s3（## 小节 A）只到下一个同级 ## 之前
  const sa = idx.sections[1]
  assert.equal(idx.plain.slice(sa.charStart, sa.charEnd), '## 小节 A\nA 的内容')
})

test('locateSection 把位置归到最靠内的章节', () => {
  const idx = buildDocIndex(blocks())
  // from=30 落在「A 的内容」块内（26..40）→ 属于 s3
  assert.equal(locateSection(idx, 30)?.id, 's3')
  // from=50 落在「B 的内容」块内 → 属于 s5
  assert.equal(locateSection(idx, 50)?.id, 's5')
})

test('sliceDoc 整篇分页：返回 nextOffset，可按页读完且不丢字符', () => {
  const idx = buildDocIndex(blocks())
  const first = sliceDoc(idx, { limit: 10 })
  assert.ok(!('error' in first))
  if ('error' in first) return
  assert.equal(first.total, idx.charCount)
  assert.equal(first.truncated, true)
  assert.equal(first.nextOffset, 10)

  // 逐页读完，拼回来应等于 plain
  let offset: number | null = 0
  let acc = ''
  while (offset !== null) {
    const page = sliceDoc(idx, { offset, limit: 10 })
    assert.ok(!('error' in page))
    if ('error' in page) return
    acc += page.text
    offset = page.nextOffset
  }
  assert.equal(acc, idx.plain)
})

test('sliceDoc 按章节读取：只返回该节', () => {
  const idx = buildDocIndex(blocks())
  const res = sliceDoc(idx, { section: 's5' })
  assert.ok(!('error' in res))
  if ('error' in res) return
  assert.equal(res.text, '## 小节 B\nB 的内容')
  assert.equal(res.section, 's5')
  assert.equal(res.title, '小节 B')
})

test('sliceDoc：未知章节报错并列出可用章节', () => {
  const idx = buildDocIndex(blocks())
  const res = sliceDoc(idx, { section: 's99' })
  assert.ok('error' in res)
  if (!('error' in res)) return
  assert.match(res.error, /s1/)
})

test('sliceDoc：offset 越界报错', () => {
  const idx = buildDocIndex(blocks())
  const res = sliceDoc(idx, { offset: idx.charCount + 1 })
  assert.ok('error' in res)
})

test('没有标题的文档：sections 为空，整篇读取仍可用', () => {
  const idx = buildDocIndex([
    { kind: 'block', level: 0, text: '只有正文', from: 0, to: 4 },
    { kind: 'block', level: 0, text: '第二段', from: 4, to: 8 },
  ])
  assert.equal(idx.sections.length, 0)
  const res = sliceDoc(idx, {})
  assert.ok(!('error' in res))
  if ('error' in res) return
  assert.equal(res.text, '只有正文\n第二段')
})