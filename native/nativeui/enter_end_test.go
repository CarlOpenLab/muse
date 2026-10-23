package nativeui

import (
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestEnterAtEndCreatesParagraph(t *testing.T) {
	a := New()
	a.source = "hello\n"
	a.refreshDoc()
	a.dirty = false
	a.beginBlockEdit(0)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	tt.Type("next")
	tt.Frame()
	if !strings.Contains(a.source, "hello\n\nnext") {
		t.Fatalf("Enter at end did not create a paragraph: %q", a.source)
	}
	if !a.dirty {
		t.Fatal("typing did not dirty the document")
	}
}
