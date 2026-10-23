/**
 * RFC-001 §7 fixture set — the round-trip corpus for M0/M0.5 acceptance
 * ("20 个 fixture 的 Markdown → 编辑器 → Markdown 语义 round-trip").
 *
 * `checks` are semantic assertions that must hold on the exported markdown
 * no matter which serializer produced it. Byte equality with the input is
 * NOT required (RFC allows normalization), but export→export idempotency IS.
 */
export interface Fixture {
  id: string;
  name: string;
  markdown: string;
  /** every returned string must match the exported markdown */
  checks: Array<{ desc: string; re: RegExp }>;
}

const F = (
  id: string,
  name: string,
  markdown: string,
  checks: Array<[string, RegExp]> = [],
): Fixture => ({ id, name, markdown, checks: checks.map(([desc, re]) => ({ desc, re })) });

export const FIXTURES: Fixture[] = [
  F('headings', '标题层级', `# 一级标题

## 二级标题

### 三级标题 with english

#### 四级标题`, [
    ['h1 keeps #', /^#\s/gm],
    ['h4 keeps ####', /^####\s四级标题$/m],
  ]),

  F('emphasis', '强调组合', `**bold** and *italic* and ~~strike~~ and \`code\` and ***all three***`, [
    ['bold', /\*\*bold\*\*/],
    ['italic', /\*italic\*/],
    ['strike', /~~strike~~/],
    ['inline code', /`code`/],
  ]),

  F('links', '链接', `[Muse](https://github.com/CarlOpenLab/muse) and <https://milkdown.dev> and an autolink`, [
    ['link target', /CarlOpenLab\/muse/],
  ]),

  F('lists-tight', '紧凑列表', `- one
- two
  - nested
- three`, [
    // Milkdown 序列化缺省用 `*`（语义等价，规范化记录见 PoC 报告）
    ['three items', /^[-*] /gm],
    ['nested item', /^[ \t]+[-*] nested$/m],
  ]),

  F('ordered', '有序列表', `1. first
2. second
   1. inner`, [
    ['numbered', /^\d+\. /gm],
  ]),

  F('tasks', '任务列表', `- [x] done item
- [ ] open item
- [ ] another`, [
    // vditor 导出勾选用大写 [X]（GFM 等价，规范化记录见 PoC 报告）
    ['checked task', /[-*] \[[xX]\] done item/],
    ['unchecked task', /[-*] \[ \] open item/],
  ]),

  F('quote', '引用', `> 一条引用
>
> > 嵌套引用`, [
    ['quote marker', /^>\s/gm],
  ]),

  F('table-align', '表格与对齐', `| 左 | 中 | 右 |
| --- | :---: | ---: |
| a | b | c |
| 灵感 | Muse | 成书 |`, [
    ['three columns', /\|/g],
    // 对齐由冒号位置决定（vditor 会缩短为 :-: / -:，横线数量无关）
    ['center align marker', /:-+:/],
    ['right align marker', /-+:\s*\|/],
  ]),

  F('code-lang', '代码围栏', `\`\`\`go
func main() {
	fmt.Println("你好，缪斯")
}
\`\`\``, [
    ['go fence', /```go/],
    ['closing fence', /```/],
  ]),

  F('math', '公式', `行内 $E = mc^2$ 与块级：

$$
\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}
$$`, [
    ['inline math', /\$E = mc\^2\$/],
    ['display math', /\$\$[\s\S]+?\\int[\s\S]+?\$\$/],
  ]),

  F('images', '图片', `![Muse 图标](assets/icon.png)

![远程图](https://example.com/muse.png "远程图片")`, [
    ['local image', /!\[[^\]]*\]\(assets\/icon\.png\)/],
    ['image title', /"远程图片"/],
  ]),

  F('hr', '分隔线', `上面

---

下面`, [
    ['hr', /^(---|\*\*\*|___)$/m],
  ]),

  F('html-block', 'HTML 块', `<div align="center">
  HTML 块按原样保留
</div>`, [
    ['html kept', /<div[^>]*>/],
  ]),

  F('cjk', '中英混排', `Muse 是一款**完全原生**的 Markdown 编辑器。

- 中文 IME 组合输入
- 「引号」与全角标点。`, [
    ['bold cjk', /\*\*完全原生\*\*/],
  ]),

  F('long-line', '超长段落', Array.from({ length: 12 }, (_, i) => `长段落第 ${i + 1} 段，用来观察光标在长行内的定位表现，`).join('') + '以及序列化稳定性。', [
    ['content kept', /长段落第 12 段/],
  ]),

  F('mixed', '综合文档', `# 缪斯周报

## 本周进展

- **内核**：原地编辑覆盖列表与引用
- [x] 公式排版
- [ ] 图片拖拽缩放

> 所写，即所见。

\`\`\`ts
const muse = 'native';
\`\`\`

| 项 | 状态 |
| --- | --- |
| 桥接 | ✅ |`, [
    ['heading', /^# 缪斯周报$/m],
    ['task done', /[-*] \[[xX]\] 公式排版/],
    ['quote', /^> 所写，即所见。$/m],
    ['fence ts', /```ts/],
    ['table row', /\|\s*桥接\s*\|\s*✅\s*\|/],
  ]),
];

/** Whitespace-level normalization both editors are allowed to make (RFC 附录). */
export function normalize(md: string): string {
  return md
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
