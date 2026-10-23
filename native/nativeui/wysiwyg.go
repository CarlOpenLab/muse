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
	block   int
	prefix  string // heading/list/quote marker, e.g. "# ", "- ", "> "
	level   int
	chrome  string // "", "list", "quote"
	indent  int
	marker  string
	task    bool
	checked bool
	runs    []mdoc.InlineRun
	anchor  int
	caret   int

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
		return len(bs[0].Items) == 1
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
	_, h := c.MeasureText(width, spans...)
	layout := ui.ShapeText(r.visibleText(), font, width)
	if r.clickSet {
		idx := layout.IndexAt(ui.Point{X: r.clickX - 10 - chromeW, Y: r.clickY - padTop})
		r.setCaret(r.runeFromUTF16(idx), false)
		r.clickSet = false
	}
	if h <= 0 {
		h = size * 1.8
	}
	ui.Column(c).FillWidth().Grow(0).Shrink(0).Height(h+padTop+6).Padding(padTop, 10, 6, 10).Children(func() {
		switch r.chrome {
		case "list":
			ui.Row(c).Grow(0).Shrink(0).Height(h).Gap(7).AlignItems(ui.Start).Children(func() {
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
				a.richBox(c, r, layout, spans, t, width, h, size)
			})
		case "quote":
			ui.Column(c).Grow(0).Shrink(0).Height(h).BorderWidth(0, 0, 0, 3).BorderColor(t.Border).Padding(0, 0, 0, 14).Children(func() {
				a.richBox(c, r, layout, spans, t, width, h, size)
			})
		default:
			a.richBox(c, r, layout, spans, t, width, h, size)
		}
	})
}

func (a *App) richBox(c *ui.Context, r *richEditor, layout *ui.TextLayout, spans []ui.Span, t *ui.Theme, width, h, size float32) {
	ui.Box(c).FillWidth().Height(h).Focusable().Focus().
		HandleInput(func(ev ui.InputEvent) bool {
			return a.richInput(c, ev, layout)
		}).
		Draw(func(p *ui.Painter, box ui.Rect) {
			s, e := r.selection()
			if s != e {
				for _, rect := range layout.SelectionRects(ui.TextInputRange{
					Start: r.utf16Index(s),
					End:   r.utf16Index(e),
				}) {
					p.Fill(ui.Rect{X: box.X + rect.X, Y: box.Y + rect.Y, W: rect.W, H: rect.H},
						ui.RGBA(80, 120, 255, 0.18), 2)
				}
			}
			p.RichText(box.X, box.Y, box.W, spans...)
			cr := layout.Caret(r.utf16Index(r.caret))
			if r.compose != "" {
				p.RichText(box.X+cr.X, box.Y+cr.Y, box.W, ui.Span{
					Text: r.compose, Size: size, Color: t.Accent, Underline: true,
				})
			}
			p.Fill(ui.Rect{X: box.X + cr.X, Y: box.Y + cr.Y, W: 1.5, H: cr.H}, t.Text, 0)
		})
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
		idx := layout.IndexAt(ui.Point{X: ev.X, Y: ev.Y})
		r.setCaret(r.runeFromUTF16(idx), ev.Mods&ui.Shift != 0)
		return true
	case ui.InputText:
		r.compose = ""
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
