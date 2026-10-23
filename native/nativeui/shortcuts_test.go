package nativeui

import (
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"
)

func editTester(a *App) *ui.Tester {
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Frame()
	return tt
}

func TestTabIndentsList(t *testing.T) {
	a := New()
	a.source = "- item\n"
	a.refreshDoc()
	a.beginBlockEdit(0)
	a.editCaretSet = true
	a.editCaretTarget = len([]rune("- item"))
	tt := editTester(a)
	tt.Key(0, ui.KeyTab)
	tt.Frame()
	if a.editSource != "  - item" {
		t.Fatalf("tab = %q", a.editSource)
	}
	tt.Key(ui.Shift, ui.KeyTab)
	tt.Frame()
	if a.editSource != "- item" {
		t.Fatalf("shift-tab = %q", a.editSource)
	}
}

func TestCmdKInsertsLink(t *testing.T) {
	a := New()
	a.source = "hello\n"
	a.refreshDoc()
	a.beginBlockEdit(0)
	a.editCaretSet = true
	a.editCaretTarget = 5
	tt := editTester(a)
	tt.Key(ui.Cmd, ui.KeyK)
	tt.Frame()
	if !strings.Contains(a.editSource, "[](https://)") {
		t.Fatalf("link = %q", a.editSource)
	}
}

func TestHeadingShortcuts(t *testing.T) {
	a := New()
	a.source = "hello\n"
	a.refreshDoc()
	a.beginBlockEdit(0)
	tt := editTester(a)
	tt.Key(ui.Cmd, ui.Key1)
	tt.Frame()
	if a.editSource != "# hello" {
		t.Fatalf("h1 = %q", a.editSource)
	}
	tt.Key(ui.Cmd, ui.Key3)
	tt.Frame()
	if a.editSource != "### hello" {
		t.Fatalf("h3 = %q", a.editSource)
	}
	tt.Key(ui.Cmd, ui.Key0)
	tt.Frame()
	if a.editSource != "hello" {
		t.Fatalf("p = %q", a.editSource)
	}
}

func TestAutoPair(t *testing.T) {
	a := New()
	a.source = "x\n"
	a.refreshDoc()
	a.beginBlockEdit(0)
	a.editCaretSet = true
	a.editCaretTarget = 1
	tt := editTester(a)
	tt.Type("(")
	tt.Type("y")
	tt.Type(")")
	tt.Frame()
	if a.editSource != "x(y)" {
		t.Fatalf("auto pair = %q", a.editSource)
	}
}

func TestShiftDownCrossesBlock(t *testing.T) {
	a := New()
	a.source = "one\n\ntwo\n"
	a.refreshDoc()
	a.beginBlockEdit(0)
	a.editCaretSet = true
	a.editCaretTarget = 3
	tt := editTester(a)
	tt.Key(ui.Shift, ui.KeyDown)
	tt.Frame()
	if a.editSelStart == a.editSelEnd {
		t.Fatalf("selection did not extend: %d,%d source=%q", a.editSelStart, a.editSelEnd, a.editSource)
	}
	tt.Type("X")
	tt.Frame()
	if !strings.Contains(a.source, "oneX") {
		t.Fatalf("cross-block replacement = %q", a.source)
	}
}

func TestAutoPairEmphasis(t *testing.T) {
	a := New()
	a.source = "z\n"
	a.refreshDoc()
	a.beginBlockEdit(0)
	a.editCaretSet = true
	a.editCaretTarget = 1
	tt := editTester(a)
	tt.Type("*")
	tt.Type("x")
	tt.Type("*")
	tt.Frame()
	if a.editSource != "z*x*" {
		t.Fatalf("emphasis pair = %q", a.editSource)
	}
}

func TestShiftUpCrossesBlock(t *testing.T) {
	a := New()
	a.source = "one\n\ntwo\n"
	a.refreshDoc()
	a.beginBlockEdit(1)
	a.editCaretSet = true
	a.editCaretTarget = 0
	tt := editTester(a)
	tt.Key(ui.Shift, ui.KeyUp)
	tt.Frame()
	if a.editSelStart == a.editSelEnd {
		t.Fatalf("selection did not extend upward: %d,%d", a.editSelStart, a.editSelEnd)
	}
}
