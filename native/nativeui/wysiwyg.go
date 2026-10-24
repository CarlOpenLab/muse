package nativeui

import (
	"strings"
	"unicode/utf16"

	"github.com/egoist/mygo/ui"

	"muse/mdoc"
)

// richEditor is a native WYSIWYG inline editor for paragraphs and headings.
// The visible runs carry styles and source mappings; Markdown markers never
// enter the editing surface. The document source is rebuilt on commit.
type richEditor struct {
	block     int
	size      float32   // 本块的字号（标题放大）
	lineOf    []int     // 每个光标位置的视觉行号
	lineTops  []float32 // 每行行框顶部（渲染行距空间）
	lineHs    []float32 // 每行行框高度
	lineCount int
	prefix    string // heading/list/quote marker, e.g. "# ", "- ", "> "
	level     int
	chrome    string // "", "list", "quote"
	indent    int
	marker    string
	task      bool
	checked   bool
	runs      []mdoc.InlineRun
	anchor    int
	caret     int

	clickX, clickY float32
	clickSet       bool
	compose        string

	snapshots []richSnapshot
}

type richSnapshot struct {
	runs          []mdoc.InlineRun
	anchor, caret int
}

func (a *App) canRichEdit(i int) bool {
	if i < 0 || i >= len(a.blocks) {
		return false
	}
	bs := a.blocks[i].doc.Blocks
	if len(bs) != 1 {
		return false
	}
	switch bs[0].Kind {
	case mdoc.Paragraph, mdoc.Heading:
		return true
	case mdoc.List:
		// A list item with nested children edits as multi-line source instead:
		// the rich run model cannot round-trip the nested lines.
		return len(bs[0].Items) == 1 && len(bs[0].Items[0].Children) == 0
	case mdoc.Quote:
		return true
	}
	return false
}

func (a *App) beginRichEditAt(i int, x, y float32) bool {
	if !a.canRichEdit(i) {
		return false
	}
	if a.rich != nil {
		a.commitRich()
	}
	if a.editing >= 0 {
		a.commitBlock()
	}
	if a.cellEdit != nil {
		a.commitCell(a.cellEdit, a.cellEdit.value)
	}
	b := a.blocks[i]
	content, prefix, level := b.Source, "", 0
	chrome, indent, marker := "", 0, ""
	task, checked := false, false
	if bs := b.doc.Blocks; bs[0].Kind == mdoc.Heading {
		level = bs[0].Level
		s := b.Source
		j := 0
		for j < len(s) && s[j] == '#' {
			j++
		}
		if j > 0 && j < len(s) && s[j] == ' ' {
			prefix = s[:j+1]
			content = s[j+1:]
		}
	} else if bs[0].Kind == mdoc.List {
		src := b.Source
		j := 0
		for j < len(src) && (src[j] == ' ' || src[j] == '\t') {
			j++
		}
		indent = j
		rest := src[j:]
		low := strings.ToLower(rest)
		prefixLen, mark := 0, "•"
		switch {
		case strings.HasPrefix(low, "- [ ] "):
			prefixLen, task, checked = len("- [ ] "), true, false
		case strings.HasPrefix(low, "- [x] "):
			prefixLen, task, checked = len("- [x] "), true, true
		case strings.HasPrefix(rest, "- "), strings.HasPrefix(rest, "* "), strings.HasPrefix(rest, "+ "):
			prefixLen = 2
		default:
			k := 0
			for k < len(rest) && rest[k] >= '0' && rest[k] <= '9' {
				k++
			}
			if k > 0 && k+1 < len(rest) && (rest[k] == '.' || rest[k] == ')') && rest[k+1] == ' ' {
				prefixLen = k + 2
				mark = rest[:k] + string(rest[k])
			}
		}
		if prefixLen > 0 {
			prefix = src[:j+prefixLen]
			content = rest[prefixLen:]
			chrome, marker = "list", mark
		}
	} else if bs[0].Kind == mdoc.Quote {
		src := b.Source
		if strings.HasPrefix(src, "> ") {
			prefix, content = "> ", src[2:]
		} else if strings.HasPrefix(src, ">") {
			prefix, content = "> ", strings.TrimPrefix(src, ">")
		}
		chrome = "quote"
	}
	content = strings.ReplaceAll(content, "\u200b", "")
	r := &richEditor{block: i, prefix: prefix, level: level, chrome: chrome, indent: indent, marker: marker, task: task, checked: checked}
	r.runs = mdoc.InlineRuns(content)
	if len(r.runs) == 0 {
		r.runs = []mdoc.InlineRun{{Text: ""}}
	}
	r.caret = len([]rune(r.visibleText()))
	r.anchor = r.caret
	r.clickX, r.clickY = x, y
	r.clickSet = x >= 0 && y >= 0
	a.rich = r
	a.editing = -1
	a.invalidate()
	return true
}

func runDisplay(run mdoc.InlineRun) string {
	if run.Math && run.Display != "" {
		return run.Display
	}
	return run.Text
}

func runLen(run mdoc.InlineRun) int { return len([]rune(runDisplay(run))) }

func (r *richEditor) visibleText() string {
	var b strings.Builder
	for _, run := range r.runs {
		b.WriteString(runDisplay(run))
	}
	return b.String()
}

func (r *richEditor) markdown() string {
	var b strings.Builder
	for _, run := range r.runs {
		if run.Text == "" {
			continue
		}
		text := strings.ReplaceAll(run.Text, "\n", "  \n")
		if run.Code {
			b.WriteString("`" + text + "`")
			continue
		}
		if run.Math {
			b.WriteString("$" + text + "$")
			continue
		}
		if run.Link != "" {
			text = "[" + text + "](" + run.Link + ")"
		}
		if run.Strike {
			text = "~~" + text + "~~"
		}
		if run.Italic {
			text = "*" + text + "*"
		}
		if run.Bold {
			text = "**" + text + "**"
		}
		b.WriteString(text)
	}
	return b.String()
}

func (r *richEditor) clone() *richEditor {
	c := *r
	c.runs = append([]mdoc.InlineRun(nil), r.runs...)
	c.snapshots = nil
	return &c
}

func (r *richEditor) snapshot() {
	r.snapshots = append(r.snapshots, richSnapshot{
		runs:   append([]mdoc.InlineRun(nil), r.runs...),
		anchor: r.anchor,
		caret:  r.caret,
	})
	if len(r.snapshots) > 100 {
		r.snapshots = r.snapshots[len(r.snapshots)-100:]
	}
}

func (r *richEditor) undo() {
	if len(r.snapshots) == 0 {
		return
	}
	s := r.snapshots[len(r.snapshots)-1]
	r.snapshots = r.snapshots[:len(r.snapshots)-1]
	r.runs = s.runs
	r.anchor, r.caret = s.anchor, s.caret
}

func (r *richEditor) selection() (int, int) {
	if r.anchor < r.caret {
		return r.anchor, r.caret
	}
	return r.caret, r.anchor
}

func (r *richEditor) snapNearest(pos int) int {
	offset := 0
	for _, run := range r.runs {
		n := runLen(run)
		if run.Math && pos > offset && pos < offset+n {
			if pos-offset <= n/2 {
				return offset
			}
			return offset + n
		}
		offset += n
	}
	return pos
}

func (r *richEditor) snapDirection(pos int, right bool) int {
	offset := 0
	for _, run := range r.runs {
		n := runLen(run)
		if run.Math && pos > offset && pos < offset+n {
			if right {
				return offset + n
			}
			return offset
		}
		offset += n
	}
	return pos
}

func (r *richEditor) setCaret(pos int, extend bool) {
	pos = max(0, min(pos, len([]rune(r.visibleText()))))
	pos = r.snapNearest(pos)
	if !extend {
		r.anchor = pos
	}
	r.caret = pos
}

func (r *richEditor) moveCaret(delta int, extend bool) {
	pos := r.caret + delta
	pos = r.snapDirection(pos, delta > 0)
	r.setCaret(pos, extend)
}

func (r *richEditor) deleteRange(start, end int) {
	if start >= end {
		return
	}
	start, end = r.atomRange(start, end)
	var out []mdoc.InlineRun
	offset := 0
	for _, run := range r.runs {
		n := runLen(run)
		rs, re := offset, offset+n
		switch {
		case re <= start || rs >= end:
			if n > 0 {
				out = append(out, run)
			}
		default:
			if run.Math {
				// Math is an atom: deleting any part removes the whole TeX.
			} else {
				runes := []rune(run.Text)
				if rs < start {
					left := run
					left.Text = string(runes[:start-rs])
					out = append(out, left)
				}
				if re > end {
					right := run
					right.Text = string(runes[end-rs:])
					out = append(out, right)
				}
			}
		}
		offset = re
	}
	r.runs = mergeRuns(out)
	if len(r.runs) == 0 {
		r.runs = []mdoc.InlineRun{{Text: ""}}
	}
	r.caret = start
	r.anchor = start
}

// atomRange expands a range so a partial inline-math atom is always removed
// or selected whole.
func (r *richEditor) atomRange(start, end int) (int, int) {
	offset := 0
	for _, run := range r.runs {
		n := runLen(run)
		rs, re := offset, offset+n
		if run.Math {
			if start > rs && start < re {
				start = rs
			}
			if end > rs && end < re {
				end = re
			}
		}
		offset = re
	}
	return start, end
}

// richAutoPair mirrors the source editor's pairing for the rich editor:
// with a selection the chosen opener wraps it; with a collapsed caret an
// opener inserts a pair with the caret inside, and typing the closer right
// before its twin skips over it. Markdown markers (*, _, ~) are NOT paired:
// in visible text they are literal characters.
func (a *App) richAutoPair(text string) bool {
	r := a.rich
	if r == nil {
		return false
	}
	runes := []rune(text)
	if len(runes) != 1 {
		return false
	}
	ch := runes[0]
	vis := []rune(r.visibleText())
	s, e := r.selection()
	if s < 0 || e < s || e > len(vis) {
		return false
	}
	// typing a closer (or a self-paired quote) right before its twin skips over
	if s == e && s < len(vis) && vis[s] == ch && strings.ContainsRune(")]}\"'`", ch) {
		r.setCaret(s+1, false)
		a.invalidate()
		return true
	}
	open := ch
	close, ok := map[rune]rune{
		'(': ')', '[': ']', '{': '}', '"': '"', '\'': '\'', '`': '`',
	}[open]
	if !ok {
		return false
	}
	if s != e {
		selected := string(vis[s:e])
		r.snapshot()
		r.deleteRange(s, e)
		r.insertText(string(open) + selected + string(close))
		r.setCaret(s+1+len([]rune(selected)), false)
		a.richDirty()
		a.invalidate()
		return true
	}
	if s < len(vis) && vis[s] == close {
		r.setCaret(s+1, false)
		a.invalidate()
		return true
	}
	r.snapshot()
	r.insertText(string(open) + string(close))
	r.setCaret(s+1, false)
	a.richDirty()
	a.invalidate()
	return true
}

// richExitTo crosses to the adjacent block at a rich block's first (dir<0)
// or last (dir>0) visual line, staying open only when the neighbour is rich
// editable.
func (a *App) richExitTo(dir int) {
	r := a.rich
	if r == nil {
		return
	}
	target := r.block + dir
	if target < 0 || target >= len(a.blocks) {
		return
	}
	if !a.beginRichEditAt(target, -1, -1) {
		return
	}
	if dir > 0 && a.rich != nil {
		a.rich.setCaret(0, false)
	}
	a.invalidate()
}

func (r *richEditor) insertText(text string) {
	if text == "" {
		return
	}
	start, end := r.selection()
	if start != end {
		r.deleteRange(start, end)
	}
	start, _ = r.atomRange(start, start)
	pos := start
	offset := 0
	for i := range r.runs {
		n := runLen(r.runs[i])
		if pos >= offset && pos <= offset+n {
			if r.runs[i].Math {
				plain := mdoc.InlineRun{Text: text}
				at := i
				if pos >= offset+n {
					at = i + 1
				}
				r.runs = append(r.runs[:at], append([]mdoc.InlineRun{plain}, r.runs[at:]...)...)
			} else {
				runes := []rune(r.runs[i].Text)
				at := pos - offset
				runes = append(runes[:at], append([]rune(text), runes[at:]...)...)
				r.runs[i].Text = string(runes)
			}
			r.caret = pos + len([]rune(text))
			r.anchor = r.caret
			r.runs = mergeRuns(r.runs)
			return
		}
		offset += n
	}
	r.runs = append(r.runs, mdoc.InlineRun{Text: text})
	r.caret = pos + len([]rune(text))
	r.anchor = r.caret
}

func (r *richEditor) toggleTask() {
	r.checked = !r.checked
	if r.checked {
		r.prefix = strings.Replace(r.prefix, "[ ]", "[x]", 1)
	} else {
		r.prefix = strings.Replace(r.prefix, "[x]", "[ ]", 1)
	}
}

func (r *richEditor) selectedText() string {
	start, end := r.selection()
	if start == end {
		return ""
	}
	var b strings.Builder
	offset := 0
	for _, run := range r.runs {
		runes := []rune(runDisplay(run))
		n := len(runes)
		rs, re := offset, offset+n
		if re > start && rs < end {
			lo := max(start-rs, 0)
			hi := min(end-rs, n)
			b.WriteString(string(runes[lo:hi]))
		}
		offset = re
	}
	return b.String()
}

func (r *richEditor) splitAt(pos int) {
	offset := 0
	for i := range r.runs {
		if r.runs[i].Math {
			offset += runLen(r.runs[i])
			continue
		}
		runes := []rune(r.runs[i].Text)
		n := len(runes)
		if pos > offset && pos < offset+n {
			left, right := r.runs[i], r.runs[i]
			left.Text = string(runes[:pos-offset])
			right.Text = string(runes[pos-offset:])
			r.runs = append(r.runs[:i], append([]mdoc.InlineRun{left, right}, r.runs[i+1:]...)...)
			return
		}
		offset += n
	}
}

func (r *richEditor) toggleStyle(kind string) {
	start, end := r.selection()
	if start == end {
		return
	}
	r.snapshot()
	r.splitAt(start)
	r.splitAt(end)
	offset := 0
	for i := range r.runs {
		n := runLen(r.runs[i])
		rs, re := offset, offset+n
		if re > start && rs < end {
			switch kind {
			case "bold":
				r.runs[i].Bold = !r.runs[i].Bold
			case "italic":
				r.runs[i].Italic = !r.runs[i].Italic
			case "strike":
				r.runs[i].Strike = !r.runs[i].Strike
			case "code":
				r.runs[i].Code = !r.runs[i].Code
			}
		}
		offset = re
	}
	r.runs = mergeRuns(r.runs)
}

func mergeRuns(in []mdoc.InlineRun) []mdoc.InlineRun {
	out := make([]mdoc.InlineRun, 0, len(in))
	for _, run := range in {
		if run.Text == "" {
			continue
		}
		if len(out) > 0 && sameRunStyle(out[len(out)-1], run) {
			out[len(out)-1].Text += run.Text
			continue
		}
		out = append(out, run)
	}
	return out
}

func sameRunStyle(a, b mdoc.InlineRun) bool {
	if a.Math || b.Math {
		return false
	}
	return a.Bold == b.Bold && a.Italic == b.Italic && a.Code == b.Code &&
		a.Strike == b.Strike && a.Link == b.Link
}

func (r *richEditor) utf16Index(runePos int) int {
	runes := []rune(r.visibleText())
	return len(utf16.Encode(runes[:max(0, min(runePos, len(runes)))]))
}

func (r *richEditor) runeFromUTF16(idx int) int {
	runes := []rune(r.visibleText())
	count := 0
	for i, ru := range runes {
		if count >= idx {
			return i
		}
		count += utf16.RuneLen(ru)
	}
	return len(runes)
}

// richLineMap derives the visual line index of every caret position
// (0..n) from the shaped layout, and the line count. Line WRAPPING is a
// function of glyph advances only, so the line structure is identical at
// any line height.
func richLineMap(layout *ui.TextLayout, n int) (lineOf []int, lines int) {
	lineOf = make([]int, n+1)
	line, lastY, lineH := 0, float32(0), float32(0)
	for i := 0; i <= n; i++ {
		rect := layout.Caret(i)
		if i == 0 {
			lastY, lineH = rect.Y, rect.H
		} else if rect.Y > lastY+lineH*0.5 {
			line++
			lastY = rect.Y
		}
		lineOf[i] = line
	}
	return lineOf, line + 1
}

// richLineHeight is the line-height multiplier the document renderer uses
// for this block kind (mdoc/view.go): headings 1.3, everything else 1.75.
func (r *richEditor) richLineHeight() float32 {
	if r.level > 0 {
		return 1.3
	}
	return 1.75
}

// lineTopAt/lineHeightAt return the render-space line box for line L.
func (r *richEditor) lineTopAt(L int) float32 {
	if L >= 0 && L < len(r.lineTops) {
		return r.lineTops[L]
	}
	return 0
}

func (r *richEditor) lineHeightAt(L int) float32 {
	if L >= 0 && L < len(r.lineHs) {
		return r.lineHs[L]
	}
	return r.richLineHeight() * r.size
}

// chromeWidth is the bullet/quote gutter width of the block.
func (r *richEditor) chromeWidth() float32 {
	switch r.chrome {
	case "list":
		w := float32(20 + r.indent*7)
		if r.indent > 0 {
			w += 7
		}
		return w
	case "quote":
		return 17
	}
	return 0
}

// richPointToIndex maps a click (element-relative) to a caret index in the
// metrics layout, honoring the render line spacing (per-line tops).
func (r *richEditor) richPointToIndex(layout *ui.TextLayout, x, y float32) int {
	metricH := layout.Caret(0).H
	if metricH <= 0 || len(r.lineTops) == 0 {
		return 0
	}
	x -= r.chromeWidth()
	line := 0
	for L := 0; L < r.lineCount; L++ {
		if y >= r.lineTops[L] {
			line = L
		}
	}
	return r.runeFromUTF16(layout.IndexAt(ui.Point{X: x, Y: float32(line)*metricH + metricH*0.5}))
}

func (a *App) richView(c *ui.Context) {
	r := a.rich
	if r == nil {
		return
	}
	t := c.Theme()
	size := float32(a.fontSize)
	weight := 0
	padTop := float32(6)
	if r.level > 0 {
		size = mdoc.HeadingSize(r.level, float32(a.fontSize))
		weight = 700
		if r.level > 2 {
			weight = 650
		}
		switch r.level {
		case 1:
			padTop += 12
		case 2:
			padTop += 8
		case 3:
			padTop += 5
		}
	}
	// 行距部分已按构造与渲染一致；残差为各块类的内边距差
	// （确定性 DIP 值，实测校准：标题 -5.3/-4.7/-3.9，列表 -10，引用 -12）
	heightFix := float32(0)
	switch r.chrome {
	case "list":
		heightFix = -10
	case "quote":
		heightFix = -12
	default:
		switch r.level {
		case 1:
			heightFix = 5.3
		case 2:
			heightFix = 4.7
		case 3:
			heightFix = 3.9
		}
	}
	chromeW := float32(0)
	switch r.chrome {
	case "list":
		chromeW = 20 + float32(r.indent)*7
		if r.indent > 0 {
			chromeW += 7
		}
	case "quote":
		chromeW = 17
	}
	spans := richSpans(r.runs, t, size, weight)
	font := ui.Font{Size: size, Weight: weight}
	width := a.blockTextWidth(c) - chromeW
	if width < 80 {
		width = 80
	}
	// Measure first: it primes MyGo's text shaper, after which the retained
	// layout wraps at the same width instead of a cold fallback width.
	_, _ = c.MeasureText(width, spans...) // 预热共享 shaper
	layout := ui.ShapeText(r.visibleText(), font, width)
	n := len([]rune(r.visibleText()))
	lineOf, lineCount := richLineMap(layout, n)
	lh := r.richLineHeight()
	// 每行真实行高：Height = max(倍数×字号, 行内字形 ascent+descent)，
	// 与元素渲染（ui.RichText + LineHeight）同一公式（internal/text/layout.go）。
	baseFM := (ui.Font{Family: t.Font, Size: size}).Metrics()
	lineTops := make([]float32, lineCount)
	lineHs := make([]float32, lineCount)
	boxH := float32(0)
	for L := 0; L < lineCount; L++ {
		start := firstIndexOfLine(lineOf, lineCount, L)
		end := firstIndexOfLine(lineOf, lineCount, L+1)
		if end == -1 {
			end = n
		}
		A, D := baseFM.Ascent, baseFM.Descent
		for _, pc := range splitSpansAt(spans, start, end) {
			fm := (ui.Font{Family: pc.Font, Size: pc.Size}).Metrics()
			A, D = max(A, fm.Ascent), max(D, fm.Descent)
		}
		H := max(lh*size, A+D)
		lineTops[L], lineHs[L] = boxH, H
		boxH += H
	}
	r.size = size
	r.lineOf = lineOf
	r.lineCount = lineCount
	r.lineTops = lineTops
	r.lineHs = lineHs
	if r.clickSet {
		idx := r.richPointToIndex(layout, r.clickX-10-chromeW, r.clickY-padTop)
		r.setCaret(r.runeFromUTF16(idx), false)
		r.clickSet = false
	}
	ui.Column(c).FillWidth().Grow(0).Shrink(0).Height(boxH+padTop+6+heightFix).Padding(padTop, 10, 6, 10).Children(func() {
		switch r.chrome {
		case "list":
			ui.Row(c).Grow(0).Shrink(0).Height(boxH).Gap(7).AlignItems(ui.Start).Children(func() {
				if r.indent > 0 {
					ui.Box(c).Width(float32(r.indent) * 7)
				}
				if r.task {
					cb := richTaskBox(c, r.checked, t)
					cb.OnClick(func() {
						r.toggleTask()
						a.richDirty()
						a.invalidate()
					})
				} else {
					ui.Text(c, r.marker).FontSize(size * 0.8).TextColor(t.TextMuted).
						Width(20).TextAlign(ui.End).SingleLine()
				}
				a.richBox(c, r, layout, spans, t, width, size, lineOf, lineCount, lineTops, lineHs, boxH)
			})
		case "quote":
			ui.Column(c).Grow(0).Shrink(0).Height(boxH).BorderWidth(0, 0, 0, 3).BorderColor(t.Border).Padding(0, 0, 0, 14).Children(func() {
				a.richBox(c, r, layout, spans, t, width, size, lineOf, lineCount, lineTops, lineHs, boxH)
			})
		default:
			a.richBox(c, r, layout, spans, t, width, size, lineOf, lineCount, lineTops, lineHs, boxH)
		}
	})
}

func (a *App) richBox(c *ui.Context, r *richEditor, layout *ui.TextLayout, spans []ui.Span, t *ui.Theme, width, size float32, lineOf []int, lineCount int, lineTops, lineHs []float32, boxH float32) {
	// TextCaret lets the element take text from the system's input methods.
	// Without it the IM is never consulted on key events, so characters from
	// a real keyboard never reach InputText — the "can't type" root cause.
	ui.Box(c).FillWidth().Height(boxH).Focusable().Focus().
		TextCaret(ui.Rect{X: 0, Y: 0, W: 1, H: r.lineHeightAt(r.caret)}).
		HandleInput(func(ev ui.InputEvent) bool {
			return a.richInput(c, ev, layout)
		}).
		Draw(func(p *ui.Painter, box ui.Rect) {
			gutter := r.chromeWidth()
			n := len([]rune(r.visibleText()))
			caretX := make([]float32, n+1)
			for i := 0; i <= n; i++ {
				caretX[i] = layout.Caret(i).X
			}
			// 选区高亮（每行的行框）
			if s, e := r.selection(); s != e {
				for L := lineOf[s]; L <= lineOf[e]; L++ {
					startIdx := firstIndexOfLine(lineOf, lineCount, L)
					endIdx := firstIndexOfLine(lineOf, lineCount, L+1)
					if endIdx == -1 {
						endIdx = n
					}
					x0, x1 := caretX[startIdx], caretX[endIdx]
					if L == lineOf[s] {
						x0 = caretX[s]
					}
					if L == lineOf[e] {
						x1 = caretX[e]
					}
					if x1 < x0 {
						x0, x1 = x1, x0
					}
					p.Fill(ui.Rect{X: box.X + gutter + x0, Y: box.Y + r.lineTopAt(L), W: x1 - x0, H: r.lineHeightAt(L)},
						ui.RGBA(80, 120, 255, 0.18), 2)
				}
			}
			// 逐行绘制（每行行框与元素渲染同公式：max(倍数×字号, ascent+descent)）；
			// 文本从 chrome 槽位之后开始，宽度扣除槽位
			for L := 0; L < lineCount; L++ {
				start, end := firstIndexOfLine(lineOf, lineCount, L), firstIndexOfLine(lineOf, lineCount, L+1)
				if end == -1 {
					end = n
				}
				lineSpans := splitSpansAt(spans, start, end)
				if len(lineSpans) > 0 {
					p.RichText(box.X+gutter, box.Y+r.lineTopAt(L), box.W-gutter, lineSpans...)
				}
			}
			// 组合串与光标
			cx := gutter + caretX[r.caret]
			cy := r.lineTopAt(lineOf[r.caret])
			if r.compose != "" {
				p.RichText(box.X+cx, box.Y+cy, box.W, ui.Span{
					Text: r.compose, Size: r.size, Color: t.Accent, Underline: true,
				})
			}
			p.Fill(ui.Rect{X: box.X + cx, Y: box.Y + cy, W: 1.5, H: r.lineHeightAt(r.caret)}, t.Text, 0)
		})
}

// firstIndexOfLine returns the first caret index on line L; -1 when L is
// past the last line.
func firstIndexOfLine(lineOf []int, lines, L int) int {
	if L >= lines {
		return -1
	}
	for i, l := range lineOf {
		if l == L {
			return i
		}
	}
	return -1
}

// splitSpansAt cuts spans to the visible runes [start, end), splitting any
// span that crosses a boundary; all style fields are preserved.
func splitSpansAt(spans []ui.Span, start, end int) []ui.Span {
	out := []ui.Span{}
	gi := 0
	for _, sp := range spans {
		rs := []rune(sp.Text)
		spanStart, spanEnd := gi, gi+len(rs)
		gi = spanEnd
		if spanEnd <= start || spanStart >= end {
			continue
		}
		from := max(spanStart, start) - spanStart
		to := min(spanEnd, end) - spanStart
		piece := sp
		piece.Text = string(rs[from:to])
		out = append(out, piece)
	}
	return out
}

func richSpans(runs []mdoc.InlineRun, t *ui.Theme, size float32, weight int) []ui.Span {
	out := make([]ui.Span, 0, len(runs))
	for _, run := range runs {
		text := runDisplay(run)
		if text == "" {
			continue
		}
		sp := ui.Span{Text: text, Size: size, Weight: weight, Color: t.Text}
		if run.Bold {
			sp.Weight = 700
		}
		if run.Italic {
			sp.Italic = true
		}
		if run.Strike {
			sp.Strikethrough = true
		}
		if run.Code {
			sp.Font = "monospace"
			sp.Size = size - 2
			sp.Background = t.Surface
		}
		if run.Link != "" {
			sp.Color = t.Accent
			sp.Underline = true
		}
		if run.Math {
			sp.Font = "Georgia"
			sp.Italic = true
		}
		out = append(out, sp)
	}
	if len(out) == 0 {
		out = append(out, ui.Span{Text: " ", Size: size, Color: t.Text})
	}
	return out
}

func (a *App) richDirty() {
	a.dirty = true
	a.updateTitle()
}

func (a *App) richInput(c *ui.Context, ev ui.InputEvent, layout *ui.TextLayout) bool {
	r := a.rich
	if r == nil {
		return false
	}
	switch ev.Kind {
	case ui.InputCompose:
		r.compose = ev.Text
		a.invalidate()
		return true
	case ui.InputPointerDown:
		size := float32(a.fontSize)
		if r.level > 0 {
			size = mdoc.HeadingSize(r.level, size)
		}
		idx := r.richPointToIndex(layout, ev.X, ev.Y)
		r.setCaret(r.runeFromUTF16(idx), ev.Mods&ui.Shift != 0)
		return true
	case ui.InputText:
		r.compose = ""
		if a.richAutoPair(ev.Text) {
			return true
		}
		r.snapshot()
		r.insertText(ev.Text)
		a.richDirty()
		a.invalidate()
		return true
	case ui.InputKeyDown:
	default:
		return false
	}
	if ev.Mods == ui.Cmd {
		switch ev.Key {
		case ui.KeyA:
			r.anchor = 0
			r.caret = len([]rune(r.visibleText()))
			a.invalidate()
			return true
		case ui.KeyC:
			if text := r.selectedText(); text != "" {
				clipboardWrite(text)
			}
			return true
		case ui.KeyX:
			if text := r.selectedText(); text != "" {
				clipboardWrite(text)
				r.snapshot()
				s, e := r.selection()
				r.deleteRange(s, e)
				a.richDirty()
				a.invalidate()
			}
			return true
		case ui.KeyV:
			if text := c.ReadClipboard(); text != "" {
				r.snapshot()
				r.insertText(text)
				a.richDirty()
				a.invalidate()
			}
			return true
		case ui.KeyZ:
			r.undo()
			a.richDirty()
			a.invalidate()
			return true
		case ui.KeyB:
			r.toggleStyle("bold")
			a.richDirty()
			a.invalidate()
			return true
		case ui.KeyI:
			r.toggleStyle("italic")
			a.richDirty()
			a.invalidate()
			return true
		case ui.KeyU:
			r.toggleStyle("strike")
			a.richDirty()
			a.invalidate()
			return true
		case ui.KeyE:
			r.toggleStyle("code")
			a.richDirty()
			a.invalidate()
			return true
		case ui.KeyK:
			// 光标在链接上：打开 URL 弹层；有选区：把选区变链接
			if !a.editLinkAtCaret() {
				if start, end := r.selection(); start != end {
					r.snapshot()
					r.splitAt(start)
					r.splitAt(end)
					offset := 0
					for i := range r.runs {
						n := runLen(r.runs[i])
						rs, re := offset, offset+n
						if re > start && rs < end {
							r.runs[i].Link = "https://"
						}
						offset = re
					}
					r.runs = mergeRuns(r.runs)
					a.richDirty()
				}
			}
			a.invalidate()
			return true
		case ui.Key0:
			r.level, r.prefix = 0, ""
			a.richDirty()
			a.invalidate()
			return true
		}
		if ev.Key >= ui.Key1 && ev.Key <= ui.Key6 {
			r.level = int(ev.Key - ui.Key0)
			r.prefix = strings.Repeat("#", r.level) + " "
			a.richDirty()
			a.invalidate()
			return true
		}
	}
	if ev.Key == ui.KeyTab && (ev.Mods == 0 || ev.Mods == ui.Shift) && r.chrome == "list" {
		if ev.Mods == ui.Shift {
			if strings.HasPrefix(r.prefix, "  ") {
				r.prefix = r.prefix[2:]
				r.indent = max(0, r.indent-2)
			}
		} else {
			r.prefix = "  " + r.prefix
			r.indent += 2
		}
		a.richDirty()
		a.invalidate()
		return true
	}
	shift := ev.Mods == ui.Shift
	switch ev.Key {
	case ui.KeyLeft:
		s, e := r.selection()
		if !shift && s != e {
			r.setCaret(s, false)
		} else {
			r.moveCaret(-1, shift)
		}
		a.invalidate()
		return true
	case ui.KeyRight:
		s, e := r.selection()
		if !shift && s != e {
			r.setCaret(e, false)
		} else {
			r.moveCaret(1, shift)
		}
		a.invalidate()
		return true
	case ui.KeyUp, ui.KeyDown:
		// 跨块语义与块编辑器一致：只在绝对边界（0 或末尾）且光标塌陷时跨到
		// 相邻块；其余情况交给文本布局做行内移动。
		n := len([]rune(r.visibleText()))
		if !shift && r.anchor == r.caret &&
			((ev.Key == ui.KeyDown && r.caret >= n) || (ev.Key == ui.KeyUp && r.caret <= 0)) {
			if ev.Key == ui.KeyDown {
				a.richExitTo(1)
			} else {
				a.richExitTo(-1)
			}
			return true
		}
		cr := layout.Caret(r.utf16Index(r.caret))
		dy := -cr.H
		if ev.Key == ui.KeyDown {
			dy = cr.H
		}
		idx := layout.IndexAt(ui.Point{X: cr.X, Y: cr.Y + dy})
		r.setCaret(r.runeFromUTF16(idx), shift)
		a.invalidate()
		return true
	case ui.KeyHome:
		r.setCaret(0, shift)
		a.invalidate()
		return true
	case ui.KeyEnd:
		r.setCaret(len([]rune(r.visibleText())), shift)
		a.invalidate()
		return true
	case ui.KeyBackspace:
		s, e := r.selection()
		r.snapshot()
		if s == e {
			s = max(0, r.caret-1)
		}
		r.deleteRange(s, e)
		a.richDirty()
		a.invalidate()
		return true
	case ui.KeyDelete:
		s, e := r.selection()
		r.snapshot()
		if s == e {
			e = min(len([]rune(r.visibleText())), r.caret+1)
		}
		r.deleteRange(s, e)
		a.richDirty()
		a.invalidate()
		return true
	case ui.KeyEnter:
		if shift {
			r.snapshot()
			r.insertText("\n")
			a.richDirty()
		} else {
			a.richSplit()
		}
		a.invalidate()
		return true
	case ui.KeyEscape:
		a.commitRich()
		return true
	}
	return false
}

func (a *App) richSplit() {
	r := a.rich
	if r == nil {
		return
	}
	s, e := r.selection()
	if s != e {
		r.deleteRange(s, e)
	}
	pos := s
	left := r.clone()
	right := r.clone()
	left.deleteRange(pos, len([]rune(left.visibleText())))
	right.deleteRange(0, pos)
	leftMD, rightMD := left.markdown(), right.markdown()
	leftMD = strings.ReplaceAll(leftMD, "\u200b", "")
	rightMD = strings.ReplaceAll(rightMD, "\u200b", "")
	if rightMD == "" {
		rightMD = "\u200b"
	}
	sep := "\n\n"
	rightPrefix := ""
	switch r.chrome {
	case "list":
		sep = "\n"
		rightPrefix = nextListPrefix(r.prefix)
	case "quote":
		sep = "\n"
		rightPrefix = "> "
	}
	b := a.blocks[r.block]
	newContent := r.prefix + leftMD + sep + rightPrefix + rightMD
	a.source = a.source[:b.Start] + newContent + a.source[b.End:]
	a.rich = nil
	a.refreshDoc()
	a.dirty = true
	a.updateTitle()
	target := b.Start + len(r.prefix) + len(leftMD) + len(sep)
	idx := -1
	for i := range a.blocks {
		if a.blocks[i].Start == target {
			idx = i
			break
		}
	}
	if idx < 0 {
		idx = len(a.blocks) - 1
	}
	if idx >= 0 {
		a.beginRichEditAt(idx, -1, -1)
	}
	a.invalidate()
}

func (a *App) commitRich() {
	r := a.rich
	if r == nil {
		return
	}
	b := a.blocks[r.block]
	next := r.prefix + strings.ReplaceAll(r.markdown(), "\u200b", "")
	old := a.source
	a.rich = nil
	if next != b.Source {
		a.source = a.source[:b.Start] + next + a.source[b.End:]
		a.refreshDoc()
		a.dirty = true
		a.updateTitle()
	}
	_ = old
	a.invalidate()
}

func richTaskBox(c *ui.Context, checked bool, t *ui.Theme) ui.Element {
	box := ui.Column(c).Width(16).Height(16).Shrink(0).Radius(3).
		Border(1, t.Border).Justify(ui.Center).AlignItems(ui.Center)
	if checked {
		box.Background(t.Accent).BorderColor(t.Accent)
		box.Children(func() {
			ui.Text(c, "✓").FontSize(10).FontWeight(700).TextColor(t.AccentText)
		})
	}
	return box
}
