package nativeui

import (
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestMathEditorHidesFences(t *testing.T) {
	a := New()
	a.source = "$$\n\\frac{a}{b}\n$$\n"
	a.refreshDoc()
	a.beginBlockEditAt(0, -1, -1)
	if a.editing < 0 || strings.Contains(a.editSource, "$$") {
		t.Fatalf("math edit = %q", a.editSource)
	}
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Type(" + x")
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if !strings.Contains(a.source, "\\frac{a}{b} + x") || !strings.HasPrefix(a.source, "$$") {
		t.Fatalf("math source = %q", a.source)
	}
}

func TestMathPreviewRenders(t *testing.T) {
	a := New()
	a.source = "$$\n\\sqrt{x+1}\n$$\n"
	a.refreshDoc()
	a.beginBlockEditAt(0, -1, -1)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if a.editSource != "\\sqrt{x+1}" {
		t.Fatalf("TeX source = %q", a.editSource)
	}
}
