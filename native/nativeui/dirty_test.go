package nativeui

import (
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestClickingBlockDoesNotDirty(t *testing.T) {
	a := New()
	a.source = "# 标题\n\n正文\n"
	a.refreshDoc()
	a.dirty = false
	a.beginBlockEditAt(1, -1, -1)
	if a.dirty {
		t.Fatal("starting an edit marked the document dirty")
	}
	a.commitBlock()
	if a.dirty {
		t.Fatal("clicking a block marked the document dirty")
	}
}

func TestViewingBlockEditorDoesNotDirty(t *testing.T) {
	a := New()
	a.source = "# 标题\n\n正文\n"
	a.refreshDoc()
	a.dirty = false
	a.beginBlockEditAt(1, -1, -1)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if a.dirty {
		t.Fatal("rendering the block editor marked the document dirty")
	}
}

func TestEditingBlockDirties(t *testing.T) {
	a := New()
	a.source = "# 标题\n\n正文\n"
	a.refreshDoc()
	a.dirty = false
	a.beginBlockEditAt(1, -1, -1)
	a.editSource += "！"
	a.applyBlockEdit()
	if !a.dirty {
		t.Fatal("editing a block did not mark the document dirty")
	}
	if a.source != "# 标题\n\n正文！\n" {
		t.Fatalf("source = %q", a.source)
	}
}

func TestClickingTableCellDoesNotDirty(t *testing.T) {
	a := New()
	a.source = "| a | b |\n| --- | --- |\n| 1 | 2 |\n"
	a.refreshDoc()
	a.dirty = false
	a.startCellEdit(0, 1, 0)
	if a.cellEdit == nil {
		t.Fatal("cell editor did not start")
	}
	ce := a.cellEdit
	a.commitCell(ce, ce.value)
	if a.dirty {
		t.Fatal("clicking a table cell marked the document dirty")
	}
}
