package nativeui

import (
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestImageEditorFieldsAndCommit(t *testing.T) {
	a := New()
	a.source = "![old](old.png \"title\")\n"
	a.refreshDoc()
	if !a.beginImageEdit(0) {
		t.Fatal("image editor did not start")
	}
	if a.imageEdit == nil || a.imageEdit.alt != "old" || a.imageEdit.src != "old.png" {
		t.Fatalf("image state = %+v", a.imageEdit)
	}
	a.imageEdit.alt = "new alt"
	a.imageEdit.src = "new.png"
	a.commitImage()
	if a.imageEdit != nil {
		t.Fatal("image editor did not commit")
	}
	if !strings.Contains(a.source, `![new alt](new.png "title")`) {
		t.Fatalf("image source = %q", a.source)
	}
}

func TestImageEditorRendersWithoutMarkdown(t *testing.T) {
	a := New()
	a.source = "![shot](/tmp/no-such-image.png)\n"
	a.refreshDoc()
	a.beginImageEdit(0)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if !tt.HasText("替代文字") || !tt.HasText("图片地址") {
		t.Fatalf("image fields missing; texts=%q", tt.Texts())
	}
	if tt.HasText("![shot]") {
		t.Fatalf("raw image syntax visible; texts=%q", tt.Texts())
	}
}
