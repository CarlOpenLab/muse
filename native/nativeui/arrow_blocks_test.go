package nativeui

import (
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestArrowAtBlockEdgeMovesToNextBlock(t *testing.T) {
	a := New()
	a.source = "one\n\ntwo\n"
	a.refreshDoc()
	a.beginBlockEdit(0)
	a.editCaretSet = true
	a.editCaretTarget = 3
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Frame()
	tt.Key(0, ui.KeyDown)
	tt.Frame()
	tt.Frame()
	tt.Type("X")
	tt.Frame()
	if !strings.Contains(a.source, "one\n\nXtwo") {
		t.Fatalf("down arrow did not reach next block: %q (edit=%d sel=%d,%d)", a.source, a.editing, a.editSelStart, a.editSelEnd)
	}
}

func TestCmdBWrapsSelection(t *testing.T) {
	a := New()
	a.source = "abc\n"
	a.refreshDoc()
	a.beginBlockEdit(0)
	a.editCaretSet = true
	a.editCaretTarget = 0
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Frame()
	tt.Key(ui.Shift, ui.KeyRight)
	tt.Key(ui.Shift, ui.KeyRight)
	tt.Frame()
	tt.Key(ui.Cmd, ui.KeyB)
	tt.Frame()
	if !strings.Contains(a.editSource, "**ab**c") {
		t.Fatalf("bold shortcut: %q", a.editSource)
	}
}
