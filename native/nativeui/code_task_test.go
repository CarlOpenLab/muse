package nativeui

import (
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestCodeEditorHidesFences(t *testing.T) {
	a := New()
	a.source = "```go\nfmt.Println(1)\n```\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	r, ok := tt.Find("fmt.Println(1)")
	if !ok {
		t.Fatal("code not found")
	}
	tt.ClickAt(r.X+20, r.Y+r.H/2)
	tt.Frame()
	if a.editing < 0 || a.editSource != "fmt.Println(1)" {
		t.Fatalf("code edit = %q (editing=%d)", a.editSource, a.editing)
	}
	tt.Key(0, ui.KeyEnd)
	tt.Type(" ")
	tt.Type("x")
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if !strings.Contains(a.source, "```go\nfmt.Println(1) x\n```") {
		t.Fatalf("code source = %q", a.source)
	}
}

func TestRichTaskToggle(t *testing.T) {
	a := New()
	a.source = "- [ ] task\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	if a.rich == nil || !a.rich.task || a.rich.checked {
		t.Fatalf("task state = %+v", a.rich)
	}
	a.rich.toggleTask()
	a.commitRich()
	if !strings.Contains(a.source, "- [x] task") {
		t.Fatalf("task source = %q", a.source)
	}
}

func TestRichOrderedListEnterIncrements(t *testing.T) {
	a := New()
	a.source = "1. one\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	a.rich.setCaret(5, false)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	tt.Type("two")
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if !strings.Contains(a.source, "1. one\n2. two") {
		t.Fatalf("ordered list = %q", a.source)
	}
}
