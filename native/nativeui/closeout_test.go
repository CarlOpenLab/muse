package nativeui

// Closeout tests for the remaining WYSIWYG-PLAN items: rich auto-pair,
// HTML block editing, task toggle while rich, and cross-block arrows.

import (
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"
	"muse/mdoc"
)

func TestRichAutoPair(t *testing.T) {
	a := New()
	a.source = "hello\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	if a.rich == nil {
		t.Fatal("rich edit did not start")
	}
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()

	// collapsed caret: typing "(" inserts a pair with the caret inside
	a.rich.caret = 2
	a.rich.anchor = 2
	tt.Type("(") // collapsed caret: pair inserted, caret inside
	if got := a.rich.visibleText(); got != "he()llo" {
		t.Fatalf("pair insert: vis = %q", got)
	}
	if a.rich.caret != 3 {
		t.Fatalf("caret after pair = %d, want 3", a.rich.caret)
	}

	// typing the closer right before its twin skips over it
	tt.Type(")")
	if got := a.rich.visibleText(); got != "he()llo" {
		t.Fatalf("skip over closer changed the text: %q", got)
	}
	if a.rich.caret != 4 {
		t.Fatalf("caret after skip = %d, want 4", a.rich.caret)
	}

	// a selection is wrapped
	a.rich.anchor = 0
	a.rich.caret = 2 // "he"
	tt.Type("[")
	if got := a.rich.visibleText(); got != "[he]()llo" {
		t.Fatalf("wrap: vis = %q", got)
	}
	if md := a.rich.markdown(); !strings.Contains(md, "[he]") {
		t.Fatalf("wrap markdown = %q", md)
	}

	// markdown markers are literal in visible text: * is not paired
	a.rich.anchor = 0
	a.rich.caret = 0
	tt.Type("*")
	if got := a.rich.visibleText(); !strings.HasPrefix(got, "*") {
		t.Fatalf("literal star: vis = %q", got)
	}
	if strings.Count(a.rich.visibleText(), "*") != 1 {
		t.Fatalf("star must not pair in visible text: %q", a.rich.visibleText())
	}
}

func TestHTMLBlockEdit(t *testing.T) {
	a := New()
	a.source = "前一段。\n\n<div>\n  <p>原始 HTML</p>\n</div>\n\n后一段。\n"
	a.refreshDoc()
	htmlIdx := -1
	for i, b := range a.blocks {
		if len(b.doc.Blocks) > 0 && b.doc.Blocks[0].Kind == mdoc.HTML {
			htmlIdx = i
		}
	}
	if htmlIdx < 0 {
		t.Fatalf("no HTML block; blocks = %d", len(a.blocks))
	}

	// clicking the rendered HTML block opens the raw source editor
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if err := tt.Click("原始 HTML"); err != nil {
		t.Fatalf("click HTML block: %v", err)
	}
	tt.Frame()
	if a.editing != htmlIdx {
		t.Fatalf("editing = %d, want %d", a.editing, htmlIdx)
	}
	if !strings.Contains(a.editSource, "<p>原始 HTML</p>") {
		t.Fatalf("editSource = %q", a.editSource)
	}

	// edit and commit through the live-edit path (the textarea change handler
	// calls applyBlockEdit on every keystroke)
	a.editSource = strings.ReplaceAll(a.editSource, "原始 HTML", "编辑后的 HTML")
	a.applyBlockEdit()
	a.commitBlock()
	tt.Frame()
	if !strings.Contains(a.source, "编辑后的 HTML") {
		t.Fatalf("committed source missing the edit: %q", a.source)
	}
	if !a.dirty {
		t.Fatal("committing an HTML edit did not dirty the document")
	}
}

func TestTaskToggleWhileRich(t *testing.T) {
	a := New()
	a.source = "- [ ] 买牛奶\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	if a.rich == nil || !a.rich.task {
		t.Fatalf("rich task edit did not start: rich=%v task=%v", a.rich != nil, a.rich != nil && a.rich.task)
	}
	a.rich.toggleTask()
	a.richDirty()
	if !a.rich.checked || !strings.Contains(a.rich.prefix, "[x]") {
		t.Fatalf("toggle: checked=%v prefix=%q", a.rich.checked, a.rich.prefix)
	}
	a.commitRich()
	if !strings.Contains(a.source, "- [x] 买牛奶") {
		t.Fatalf("committed source = %q", a.source)
	}
	// the doc-level toggle defers to the rich editor while it is open
	a.beginRichEditAt(0, -1, -1)
	a.toggleTask(0, 0, false)
	if a.rich == nil || a.rich.checked {
		t.Fatalf("doc toggle did not defer to the rich editor")
	}
	a.commitRich()
	if !strings.Contains(a.source, "- [ ] 买牛奶") {
		t.Fatalf("committed source = %q", a.source)
	}
}

func TestRichCrossBlockArrows(t *testing.T) {
	a := New()
	a.source = "第一段。\n\n第二段。\n\n第三段。\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	if a.rich == nil {
		t.Fatal("rich edit did not start")
	}
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()

	// Down at the end of block 0 crosses into block 1 with the caret at start
	a.rich.setCaret(len([]rune(a.rich.visibleText())), false)
	tt.Key(0, ui.KeyDown)
	tt.Frame()
	if a.rich == nil || a.rich.block != 1 {
		t.Fatal("Down did not cross blocks")
	}
	if a.rich.caret != 0 {
		t.Fatalf("caret after crossing down = %d, want 0", a.rich.caret)
	}

	// Up at the start of block 1 crosses back with the caret at the end
	tt.Key(0, ui.KeyUp)
	tt.Frame()
	if a.rich == nil || a.rich.block != 0 {
		t.Fatal("Up did not cross back")
	}
	if a.rich.caret != len([]rune(a.rich.visibleText())) {
		t.Fatalf("caret after crossing up = %d, want end", a.rich.caret)
	}

	// arrows inside a block still move the caret without crossing
	a.rich.setCaret(1, false)
	tt.Key(0, ui.KeyDown)
	tt.Frame()
	if a.rich == nil || a.rich.block != 0 {
		t.Fatal("Down in the middle crossed blocks")
	}
}

func TestImageWidthStepper(t *testing.T) {
	a := New()
	a.source = `<img src="resources/icon.png" alt="图标" width="120">` + "\n"
	a.refreshDoc()
	imgIdx := -1
	for i, b := range a.blocks {
		if len(b.doc.Blocks) > 0 && b.doc.Blocks[0].Kind == mdoc.Image {
			imgIdx = i
		}
	}
	if imgIdx < 0 {
		t.Fatal("no image block")
	}
	if !a.beginImageEdit(imgIdx) {
		t.Fatal("image edit did not start")
	}
	if a.imageEdit.width != 120 {
		t.Fatalf("width = %v, want 120", a.imageEdit.width)
	}

	// + widens by 24
	if ui := a.imageEditView; ui == nil {
		t.Fatal("nil view")
	}
	a.imageEdit.width += 24
	a.commitImage()
	if !strings.Contains(a.source, `width="144"`) {
		t.Fatalf("source missing width=144: %q", a.source)
	}

	// the written HTML form parses back into ImgWidth
	a.refreshDoc()
	b := a.blocks[imgIdx].doc.Blocks[0]
	if b.Kind != mdoc.Image || b.ImgWidth != 144 {
		t.Fatalf("round-trip: kind=%v width=%v", b.Kind, b.ImgWidth)
	}

	// 重置 returns to the automatic markdown form
	if !a.beginImageEdit(imgIdx) {
		t.Fatal("image edit did not restart")
	}
	a.imageEdit.width = 0
	a.commitImage()
	if strings.Contains(a.source, "<img") {
		t.Fatalf("reset should write the markdown form: %q", a.source)
	}
	if !strings.Contains(a.source, `![图标](resources/icon.png)`) {
		t.Fatalf("markdown form = %q", a.source)
	}
}

func TestOrderedEnterIncrementsMarker(t *testing.T) {
	a := New()
	a.source = "1. 第一项\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	if a.rich == nil {
		t.Fatal("rich edit did not start")
	}
	a.rich.setCaret(len([]rune(a.rich.visibleText())), false)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	a.commitRich()
	if !strings.Contains(a.source, "2. ") {
		t.Fatalf("ordered marker did not increment: %q", a.source)
	}
	if !strings.Contains(a.source, "1. 第一项") {
		t.Fatalf("original item lost: %q", a.source)
	}
}

func TestInlineMathStaysTypesetAtomInRich(t *testing.T) {
	a := New()
	a.source = "能量 $E = mc^2$ 守恒。\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	if a.rich == nil {
		t.Fatal("rich edit did not start")
	}
	found := false
	for _, run := range a.rich.runs {
		if run.Math {
			found = true
			if run.Display == "" {
				t.Fatal("math run lost its rendered-for-editing atom")
			}
		}
	}
	if !found {
		t.Fatal("no math run in the rich editor")
	}
}

func TestNestedListEditsAsSourceAndRoundTrips(t *testing.T) {
	a := New()
	a.source = "- 父项\n  - 嵌套项\n"
	a.refreshDoc()
	if a.beginRichEditAt(0, -1, -1) {
		t.Fatal("a list item with nested children must not open the rich editor")
	}
	if a.rich != nil {
		t.Fatal("rich editor started on a nested list")
	}

	// the source surface round-trips the nested marker exactly
	a.beginBlockEdit(0)
	if !strings.Contains(a.editSource, "  - 嵌套项") {
		t.Fatalf("editSource = %q", a.editSource)
	}
	// indent the nested line one level deeper with Tab
	a.editSelStart, a.editSelEnd = len(a.editSource), len(a.editSource)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Key(0, ui.KeyTab)
	tt.Frame()
	if !strings.Contains(a.editSource, "    - 嵌套项") {
		t.Fatalf("Tab did not indent the nested line: %q", a.editSource)
	}
	a.applyBlockEdit()
	a.commitBlock()
	if !strings.Contains(a.source, "    - 嵌套项") {
		t.Fatalf("indent did not round-trip: %q", a.source)
	}

	// Shift+Tab outdents back
	a.beginBlockEdit(0)
	a.editSelStart, a.editSelEnd = len(a.editSource), len(a.editSource)
	tt.Frame()
	tt.Key(ui.Shift, ui.KeyTab)
	tt.Frame()
	a.applyBlockEdit()
	a.commitBlock()
	if !strings.Contains(a.source, "  - 嵌套项") {
		t.Fatalf("outdent did not round-trip: %q", a.source)
	}
}
