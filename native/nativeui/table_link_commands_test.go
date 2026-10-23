package nativeui

// Tests for the table structure commands (rows/columns) and the link URL
// popover, per the WYSIWYG-PLAN closeout list.

import (
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"
	"muse/mdoc"
)

const tableSrc = "| a | b |\n| --- | --- |\n| 1 | 2 |\n"

func tableIndexOf(a *App) int {
	for i, b := range a.blocks {
		if len(b.doc.Blocks) > 0 && b.doc.Blocks[0].Kind == mdoc.Table {
			return i
		}
	}
	return -1
}

func TestInsertTableRowBelow(t *testing.T) {
	a := New()
	a.source = tableSrc
	a.refreshDoc()
	idx := tableIndexOf(a)
	if idx < 0 {
		t.Fatal("no table block")
	}

	// below the last row appends at the end
	if !a.insertTableRowBelow(idx, 1) {
		t.Fatal("insert below row 1 failed")
	}
	want := "| a | b |\n| --- | --- |\n| 1 | 2 |\n|   |   |\n"
	if a.source != want {
		t.Fatalf("source = %q, want %q", a.source, want)
	}

	// below the header inserts the first body row (after the alignment line)
	a2 := New()
	a2.source = tableSrc
	a2.refreshDoc()
	if !a2.insertTableRowBelow(tableIndexOf(a2), 0) {
		t.Fatal("insert below header failed")
	}
	want2 := "| a | b |\n| --- | --- |\n|   |   |\n| 1 | 2 |\n"
	if a2.source != want2 {
		t.Fatalf("source = %q, want %q", a2.source, want2)
	}

	// a negative row appends after the last row
	a3 := New()
	a3.source = tableSrc
	a3.refreshDoc()
	if !a3.insertTableRowBelow(tableIndexOf(a3), -1) {
		t.Fatal("append row failed")
	}
	if !strings.HasSuffix(a3.source, "|   |   |\n") {
		t.Fatalf("append row landed wrong: %q", a3.source)
	}
}

func TestDeleteTableRow(t *testing.T) {
	a := New()
	a.source = tableSrc
	a.refreshDoc()
	idx := tableIndexOf(a)

	if a.deleteTableRow(idx, 0) {
		t.Fatal("deleting the header row must be refused")
	}
	if !a.deleteTableRow(idx, 1) {
		t.Fatal("delete body row failed")
	}
	want := "| a | b |\n| --- | --- |\n"
	if a.source != want {
		t.Fatalf("source = %q, want %q", a.source, want)
	}
}

func TestInsertDeleteTableColumn(t *testing.T) {
	a := New()
	a.source = tableSrc
	a.refreshDoc()
	idx := tableIndexOf(a)

	if !a.insertTableColumnAt(idx, 1) {
		t.Fatal("insert column failed")
	}
	want := "| a |   | b |\n| --- | --- | --- |\n| 1 |   | 2 |\n"
	if a.source != want {
		t.Fatalf("source = %q, want %q", a.source, want)
	}

	// the new alignment cell mirrors the neighbour's colon style
	a2 := New()
	a2.source = "| a | b |\n| :---: | ---: |\n| 1 | 2 |\n"
	a2.refreshDoc()
	if !a2.insertTableColumnAt(tableIndexOf(a2), 1) {
		t.Fatal("insert column with colons failed")
	}
	want2 := "| a |   | b |\n| :---: | :---: | ---: |\n| 1 |   | 2 |\n"
	if a2.source != want2 {
		t.Fatalf("source = %q, want %q", a2.source, want2)
	}

	if !a.deleteTableColumnAt(idx, 1) {
		t.Fatal("delete column failed")
	}
	if a.source != tableSrc {
		t.Fatalf("source = %q, want original", a.source)
	}
}

func TestDeleteLastColumnRefused(t *testing.T) {
	a := New()
	a.source = "| 只有一列 |\n| --- |\n| 1 |\n"
	a.refreshDoc()
	if a.deleteTableColumnAt(tableIndexOf(a), 0) {
		t.Fatal("deleting the last column must be refused")
	}
	if a.status == "" {
		t.Fatal("refusal did not surface a notice")
	}
	if !strings.Contains(a.source, "只有一列") {
		t.Fatalf("source changed: %q", a.source)
	}
}

func TestInsertRowBelowCell(t *testing.T) {
	a := New()
	a.source = tableSrc
	a.refreshDoc()
	idx := tableIndexOf(a)
	a.startCellEdit(idx, 1, 0)
	if a.cellEdit == nil {
		t.Fatal("cell edit did not start")
	}
	a.insertRowBelowCell()
	if a.cellEdit == nil || a.cellEdit.row != 2 || a.cellEdit.col != 0 {
		t.Fatalf("cell edit did not move to the new row: %+v", a.cellEdit)
	}
	if !strings.Contains(a.source, "|   |   |") {
		t.Fatalf("empty row missing: %q", a.source)
	}
}

func TestLinkPopoverEditsURL(t *testing.T) {
	a := New()
	a.source = "看 [文档](https://old.example.com) 即可。\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	if a.rich == nil {
		t.Fatal("rich edit did not start")
	}
	// visible text is "看 文档 即可。" — put the caret inside 文档 (rune 3)
	a.rich.caret = 3
	a.rich.anchor = 3
	if !a.editLinkAtCaret() {
		t.Fatal("caret inside a link did not open the popover")
	}
	if !a.linkPopOpen || a.linkPopURL != "https://old.example.com" || a.linkPopLabel != "文档" {
		t.Fatalf("popover state: open=%v url=%q label=%q", a.linkPopOpen, a.linkPopURL, a.linkPopLabel)
	}

	a.linkPopURL = "https://new.example.com"
	a.applyLinkPop()
	if a.linkPopOpen {
		t.Fatal("popover stayed open after apply")
	}
	md := a.rich.markdown()
	if strings.Contains(md, "old.example.com") {
		t.Fatalf("old URL survived: %q", md)
	}
	if !strings.Contains(md, "[文档](https://new.example.com)") {
		t.Fatalf("rewritten link missing: %q", md)
	}
}

func TestLinkPopoverOutsideLinkFallsBackToSelection(t *testing.T) {
	a := New()
	a.source = "[旧链](https://x) 文字\n"
	a.refreshDoc()
	a.beginRichEditAt(0, -1, -1)
	if a.rich == nil {
		t.Fatal("rich edit did not start")
	}

	// caret outside any link run: no popover
	a.rich.caret = len([]rune(a.rich.visibleText()))
	a.rich.anchor = a.rich.caret
	if a.editLinkAtCaret() {
		t.Fatal("popover opened outside a link")
	}

	// Cmd+K with a selection turns the selection into a link
	vis := a.rich.visibleText()
	runes := []rune(vis)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	a.rich.anchor = len(runes) - 2 // "文字" is two runes
	a.rich.caret = len(runes)
	tt.Frame()
	tt.Key(ui.Cmd, ui.KeyK)
	tt.Frame()
	md := a.rich.markdown()
	if !strings.Contains(md, "[文字](https://)") {
		t.Fatalf("selection did not become a link: %q", md)
	}

	// now the caret sits inside a link: Cmd+K opens the popover instead
	if !a.editLinkAtCaret() && !a.linkPopOpen {
		// place the caret inside the new link run explicitly
		off := 0
		for i, run := range a.rich.runs {
			n := len([]rune(run.Text))
			if run.Link != "" {
				a.rich.caret = off + 1
				_ = i
				break
			}
			off += n
		}
		if !a.editLinkAtCaret() {
			t.Fatal("caret inside a link did not open the popover")
		}
	}
	if !a.linkPopOpen || a.linkPopURL != "https://" {
		t.Fatalf("popover state: open=%v url=%q", a.linkPopOpen, a.linkPopURL)
	}
}

func TestTableMenuThroughTester(t *testing.T) {
	a := New()
	a.source = tableSrc
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if err := tt.RightClick("1"); err != nil {
		t.Fatalf("right click cell: %v", err)
	}
	if err := tt.ChooseMenuItem("在下方插入行"); err != nil {
		t.Fatalf("choose insert row: %v", err)
	}
	tt.Frame()
	if !strings.Contains(a.source, "|   |   |") {
		t.Fatalf("menu action did not insert a row: %q", a.source)
	}
	// with a cell edit active, the delete items appear and work
	a.startCellEdit(tableIndexOf(a), 2, 0)
	tt.Frame()
	if err := tt.RightClick("1"); err != nil {
		t.Fatalf("right click cell again: %v", err)
	}
	if err := tt.ChooseMenuItem("删除此行"); err != nil {
		t.Fatalf("choose delete row: %v", err)
	}
	tt.Frame()
	if strings.Contains(a.source, "|   |   |") {
		t.Fatalf("delete row did not run: %q", a.source)
	}
}
