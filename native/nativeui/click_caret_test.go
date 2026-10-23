package nativeui

import (
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestClickPlacesCaretAndArrowsPersist(t *testing.T) {
	a := New()
	a.source = "hello world\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	r, ok := tt.Find("hello world")
	if !ok {
		t.Fatal("text not found")
	}
	tt.ClickAt(r.X+35, r.Y+r.H/2)
	tt.Frame()
	tt.Frame()
	tt.Type("X")
	tt.Frame()
	if a.rich == nil || a.rich.visibleText() != "helloX world" {
		t.Fatalf("click caret = %q", a.rich.visibleText())
	}
	tt.Key(0, ui.KeyLeft)
	tt.Frame()
	tt.Type("Y")
	tt.Frame()
	if a.rich.visibleText() != "helloYX world" {
		t.Fatalf("arrow did not persist: %q", a.rich.visibleText())
	}
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
}
