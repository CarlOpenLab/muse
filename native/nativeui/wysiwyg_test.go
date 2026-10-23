package nativeui

import (
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestRichHeadingHidesMarkers(t *testing.T) {
	a := New()
	a.source = "# 标题\n\n正文\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	r, ok := tt.Find("标题")
	if !ok {
		t.Fatal("heading not found")
	}
	tt.ClickAt(r.X+12, r.Y+r.H/2)
	tt.Frame()
	if a.rich == nil {
		t.Fatal("heading did not enter the rich editor")
	}
	if a.rich.prefix != "# " || a.rich.visibleText() != "标题" {
		t.Fatalf("rich heading = prefix %q visible %q", a.rich.prefix, a.rich.visibleText())
	}
	a.rich.setCaret(len([]rune(a.rich.visibleText())), false)
	tt.Type("!")
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if a.rich != nil {
		t.Fatal("Escape did not commit the rich heading")
	}
	if a.source != "# 标题!\n\n正文\n" {
		t.Fatalf("source = %q", a.source)
	}
	if !a.dirty {
		t.Fatal("rich heading edit did not mark the document dirty")
	}
}

func TestRichParagraphTogglesBold(t *testing.T) {
	a := New()
	a.source = "hello\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	if a.rich == nil {
		t.Fatal("rich editor did not start")
	}
	a.rich.anchor = 0
	a.rich.caret = 5
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Key(ui.Cmd, ui.KeyB)
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if !strings.Contains(a.source, "**hello**") {
		t.Fatalf("bold source = %q", a.source)
	}
}

func TestRichUndo(t *testing.T) {
	a := New()
	a.source = "hey\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Type("X")
	tt.Frame()
	if a.rich.visibleText() != "heyX" {
		t.Fatalf("typed = %q", a.rich.visibleText())
	}
	tt.Key(ui.Cmd, ui.KeyZ)
	tt.Frame()
	if a.rich.visibleText() != "hey" {
		t.Fatalf("undo = %q", a.rich.visibleText())
	}
}

func TestRichMarkdownRoundTrip(t *testing.T) {
	a := New()
	a.source = "a **bold** *it* `code` [l](https://x)\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	if a.rich == nil {
		t.Fatal("rich editor did not start")
	}
	if strings.Contains(a.rich.visibleText(), "**") || strings.Contains(a.rich.visibleText(), "`") {
		t.Fatalf("markers visible: %q", a.rich.visibleText())
	}
	a.commitRich()
	if !strings.Contains(a.source, "**bold**") || !strings.Contains(a.source, "[l](https://x)") {
		t.Fatalf("source lost formatting: %q", a.source)
	}
}

func TestRichHeadingShortcut(t *testing.T) {
	a := New()
	a.source = "hello\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Key(ui.Cmd, ui.Key2)
	tt.Frame()
	if a.rich.level != 2 || a.rich.prefix != "## " {
		t.Fatalf("rich heading = level %d prefix %q", a.rich.level, a.rich.prefix)
	}
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if a.source != "## hello\n" {
		t.Fatalf("source = %q", a.source)
	}
}

func TestRichListHidesMarker(t *testing.T) {
	a := New()
	a.source = "- item\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	r, _ := tt.Find("item")
	tt.ClickAt(r.X+12, r.Y+r.H/2)
	tt.Frame()
	if a.rich == nil || a.rich.chrome != "list" || a.rich.visibleText() != "item" {
		t.Fatalf("rich list = %+v", a.rich)
	}
	a.rich.setCaret(4, false)
	tt.Type("!")
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if a.source != "- item!\n" {
		t.Fatalf("list source = %q", a.source)
	}
}

func TestRichListTabIndents(t *testing.T) {
	a := New()
	a.source = "- item\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Key(0, ui.KeyTab)
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if a.source != "  - item\n" {
		t.Fatalf("indented list = %q", a.source)
	}
}

func TestRichListEnterCreatesNext(t *testing.T) {
	a := New()
	a.source = "- one\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	a.rich.setCaret(3, false)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	tt.Type("two")
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if !strings.Contains(a.source, "- one\n- two") {
		t.Fatalf("list enter = %q", a.source)
	}
}

func TestRichQuoteHidesMarker(t *testing.T) {
	a := New()
	a.source = "> quoted\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	if a.rich == nil || a.rich.chrome != "quote" || a.rich.visibleText() != "quoted" {
		t.Fatalf("rich quote = %+v", a.rich)
	}
	a.commitRich()
	if a.source != "> quoted\n" {
		t.Fatalf("quote source = %q", a.source)
	}
}

func TestRichInlineMathShowsRenderedAtom(t *testing.T) {
	a := New()
	a.source = "before $x^2$ after\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	if a.rich == nil {
		t.Fatal("rich editor did not start")
	}
	visible := a.rich.visibleText()
	if strings.Contains(visible, "$") || strings.Contains(visible, "^2") {
		t.Fatalf("math markers visible: %q", visible)
	}
	if strings.Contains(visible, "x^2") {
		t.Fatalf("raw math visible = %q", visible)
	}
	a.commitRich()
	if a.source != "before $x^2$ after\n" {
		t.Fatalf("math source = %q", a.source)
	}
}

func TestTableOutsideCellDoesNotOpenSource(t *testing.T) {
	a := New()
	a.source = "| A | B |\n| --- | --- |\n| 1 | 2 |\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	r, ok := tt.Find("A")
	if !ok {
		t.Fatal("table header not found")
	}
	tt.ClickAt(r.X+2, r.Y+2)
	tt.Frame()
	if a.editing >= 0 {
		t.Fatalf("table opened the source editor: block %d", a.editing)
	}
}

func TestRichIMECompositionCommits(t *testing.T) {
	a := New()
	a.source = "start\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Compose("你", 1)
	tt.Frame()
	if a.rich.compose != "你" {
		t.Fatalf("composition = %q", a.rich.compose)
	}
	tt.Type("你")
	tt.Frame()
	if a.rich.visibleText() != "start你" {
		t.Fatalf("committed text = %q", a.rich.visibleText())
	}
	if a.rich.compose != "" {
		t.Fatalf("composition not cleared: %q", a.rich.compose)
	}
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if a.source != "start你\n" {
		t.Fatalf("source = %q", a.source)
	}
}
