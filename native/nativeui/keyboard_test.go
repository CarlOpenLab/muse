package nativeui

import (
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestArrowKeysMoveCaret(t *testing.T) {
	a := New()
	a.source = "abc\n"
	a.refreshDoc()
	a.beginBlockEdit(0)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Key(0, ui.KeyLeft)
	tt.Key(0, ui.KeyLeft)
	tt.Type("X")
	tt.Frame()
	if a.editSource != "aXbc" {
		t.Fatalf("left arrows did not move the caret: %q", a.editSource)
	}
}

func TestClickEntersEditing(t *testing.T) {
	a := New()
	a.source = "hello\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	r, ok := tt.Find("hello")
	if !ok {
		t.Fatal("text not found")
	}
	tt.ClickAt(r.X+12, r.Y+r.H/2)
	tt.Frame()
	tt.Type("X")
	tt.Frame()
	if a.editSource == "hello" {
		t.Fatalf("typing after click did not edit: %q", a.editSource)
	}
}
