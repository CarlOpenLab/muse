package nativeui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestNativeShellRendersMarkdown(t *testing.T) {
	a := New()
	a.source = "# 标题\n\n正文 **加粗**。\n\n- 一\n- 二\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	for _, want := range []string{"标题", "正文", "加粗", "一", "二"} {
		if !tt.HasText(want) {
			t.Fatalf("missing %q; texts = %q", want, tt.Texts())
		}
	}
}

func TestBlockClickOpensInput(t *testing.T) {
	a := New()
	a.source = "# 标题\n\n正文段落。\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if err := tt.Click("正文段落。"); err != nil {
		t.Fatalf("click block: %v", err)
	}
	if a.rich == nil || a.rich.visibleText() != "正文段落。" {
		t.Fatalf("clicking a paragraph did not start a rich edit: %+v", a.rich)
	}
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if a.rich != nil {
		t.Fatal("Escape did not finish the rich edit")
	}
}

func TestOpenWorkspaceAndFile(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "one.md"), []byte("# One\n\nFirst.\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dir, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "sub", "two.md"), []byte("# Two\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	a := New()
	a.setWorkspace(dir)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if !tt.HasText("one.md") {
		t.Fatalf("file tree missing one.md; texts = %q", tt.Texts())
	}
	if err := tt.Click("one.md"); err != nil {
		t.Fatalf("click file: %v", err)
	}
	if a.path != filepath.Join(dir, "one.md") {
		t.Fatalf("opened %q, want one.md", a.path)
	}
}

func TestRailTogglesPanel(t *testing.T) {
	a := New()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if !a.panelOpen {
		t.Fatal("panel should start open")
	}
	if err := tt.Click("AI 助手"); err != nil {
		t.Fatalf("click AI: %v", err)
	}
	if a.panel != panelAI || !a.panelOpen {
		t.Fatalf("panel = %v, open = %v", a.panel, a.panelOpen)
	}
	if err := tt.Click("AI 助手"); err != nil {
		t.Fatalf("click AI again: %v", err)
	}
	if a.panelOpen {
		t.Fatal("panel should collapse when the active icon is clicked")
	}
}

func TestDarkThemeRenders(t *testing.T) {
	a := New()
	a.source = "# 标题\n\n正文。\n"
	a.refreshDoc()
	a.themeMode = 1
	tt := ui.NewTester(a.View, 1200, 800)
	tt.SetDark(true)
	tt.Frame()
	if !tt.HasText("标题") {
		t.Fatalf("missing rendered title; texts = %q", tt.Texts())
	}
}

func TestSplitSourcePreservesFences(t *testing.T) {
	src := "# One\n\n```go\nline one\n\nline two\n```\n\nAfter.\n"
	blocks := splitSource(src)
	if len(blocks) != 3 {
		t.Fatalf("got %d blocks: %#v", len(blocks), blocks)
	}
	if !strings.Contains(blocks[1].Source, "line one\n\nline two") {
		t.Fatalf("fence split: %q", blocks[1].Source)
	}
	if blocks[2].Source != "After." {
		t.Fatalf("last block = %q", blocks[2].Source)
	}
}

func TestBlockClickPlacesCaretNearPointer(t *testing.T) {
	a := New()
	a.source = "# 标题\n\n正文段落。\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	r, ok := tt.Find("正文段落。")
	if !ok {
		t.Fatal("paragraph not found")
	}
	tt.ClickAt(r.X+20, r.Y+r.H/2)
	tt.Frame()
	tt.Type("X")
	tt.Frame()
	visible := a.rich.visibleText()
	if !strings.Contains(visible, "X") {
		t.Fatalf("typed X missing: %q", visible)
	}
	if strings.HasSuffix(visible, "X") {
		t.Fatalf("caret stayed at the end: %q", visible)
	}
	tt.Type("Y")
	tt.Frame()
	if !strings.Contains(a.rich.visibleText(), "XY") {
		t.Fatalf("caret reset between frames: %q", a.rich.visibleText())
	}
}

func TestToggleTaskUpdatesSource(t *testing.T) {
	a := New()
	a.source = "- [ ] first\n- [x] second\n"
	a.refreshDoc()
	a.toggleTask(0, 0, true)
	if !strings.Contains(a.source, "- [x] first") {
		t.Fatalf("first task not checked: %q", a.source)
	}
	if !strings.Contains(a.source, "- [x] second") {
		t.Fatalf("second task changed unexpectedly: %q", a.source)
	}
	a.toggleTask(1, 0, false)
	if !strings.Contains(a.source, "- [ ] second") {
		t.Fatalf("second task not cleared: %q", a.source)
	}
	if !a.dirty {
		t.Fatal("task toggle did not mark the document dirty")
	}
}

func TestTaskBoxClickDoesNotOpenEditor(t *testing.T) {
	a := New()
	a.source = "- [x] done\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	rect, ok := tt.Find("done")
	if !ok {
		t.Fatalf("task text not found; texts = %q", tt.Texts())
	}
	tt.ClickAt(rect.X-12, rect.Y+4)
	tt.Frame()
	if strings.Contains(a.source, "[x] done") {
		t.Fatalf("task box click did not toggle: %q", a.source)
	}
	if a.editing >= 0 {
		t.Fatal("task box click also opened the block editor")
	}
}

func TestSplitSourceKeepsNestedListsWithTheirItem(t *testing.T) {
	src := "- one\n- two\n  - nested\n\nAfter.\n"
	blocks := splitSource(src)
	if len(blocks) != 3 {
		t.Fatalf("got %d blocks: %#v", len(blocks), blocks)
	}
	if blocks[0].Source != "- one" {
		t.Fatalf("first block = %q", blocks[0].Source)
	}
	if blocks[1].Source != "- two\n  - nested" {
		t.Fatalf("second block = %q", blocks[1].Source)
	}
	if !isListItemBlock(blocks[0]) || !isListItemBlock(blocks[1]) {
		t.Fatal("list blocks not recognised")
	}
}

func TestTableCellCommitReplacesOnlyCell(t *testing.T) {
	a := New()
	a.source = "| name | state |\n| --- | --- |\n| mdoc | ok |\n"
	a.refreshDoc()
	a.startCellEdit(0, 1, 0)
	if a.cellEdit == nil || a.cellEdit.value != "mdoc" {
		t.Fatalf("cell edit = %+v", a.cellEdit)
	}
	a.commitCell(a.cellEdit, "native")
	if !strings.Contains(a.source, "| native | ok |") {
		t.Fatalf("cell not replaced: %q", a.source)
	}
	if a.cellEdit != nil {
		t.Fatal("cell editor stayed open")
	}
}

func TestTableCellClickEditsInline(t *testing.T) {
	a := New()
	a.source = "| name | state |\n| --- | --- |\n| mdoc | ok |\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	rect, ok := tt.Find("mdoc")
	if !ok {
		t.Fatalf("cell text not found; texts = %q", tt.Texts())
	}
	tt.ClickAt(rect.X+rect.W/2, rect.Y+rect.H/2)
	tt.Frame()
	if a.cellEdit == nil {
		t.Fatalf("clicking a cell did not start inline editing (editing=%d, texts=%q)", a.editing, tt.Texts())
	}
	if a.editing >= 0 {
		t.Fatalf("clicking a cell also opened the whole-table editor (block %d)", a.editing)
	}
	tt.Type("!")
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	if !strings.Contains(a.source, "mdoc!") {
		t.Fatalf("typed cell text missing: %q", a.source)
	}
	if a.cellEdit != nil {
		t.Fatal("cell editor stayed open after Enter")
	}
}

func TestTableCellSwitchCommitsPreviousCell(t *testing.T) {
	a := New()
	a.source = "| name | state |\n| --- | --- |\n| mdoc | ok |\n"
	a.refreshDoc()
	a.startCellEdit(0, 1, 0)
	a.cellEdit.value = "native"
	a.startCellEdit(0, 1, 1)
	if !strings.Contains(a.source, "| native | ok |") {
		t.Fatalf("previous cell not committed: %q", a.source)
	}
	if a.cellEdit == nil || a.cellEdit.col != 1 || a.cellEdit.value != "ok" {
		t.Fatalf("new cell = %+v", a.cellEdit)
	}
}

func TestTableCellBlurCommitsWhenClickingAnotherBlock(t *testing.T) {
	a := New()
	a.source = "| name | state |\n| --- | --- |\n| mdoc | ok |\n\nAfter.\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	rect, ok := tt.Find("mdoc")
	if !ok {
		t.Fatalf("cell text not found; texts = %q", tt.Texts())
	}
	tt.ClickAt(rect.X+rect.W/2, rect.Y+rect.H/2)
	tt.Frame()
	tt.Type("!")
	tt.Frame()
	if err := tt.Click("After."); err != nil {
		t.Fatalf("click another block: %v", err)
	}
	tt.Frame()
	if !strings.Contains(a.source, "mdoc!") {
		t.Fatalf("cell edit not committed on blur: %q", a.source)
	}
}

func TestSplitSourceSeparatesQuoteLines(t *testing.T) {
	src := "> first\n> second\n\nAfter.\n"
	blocks := splitSource(src)
	if len(blocks) != 3 {
		t.Fatalf("got %d blocks: %#v", len(blocks), blocks)
	}
	if blocks[0].Source != "> first" || blocks[1].Source != "> second" {
		t.Fatalf("quote blocks = %q / %q", blocks[0].Source, blocks[1].Source)
	}
	if !isQuoteLineBlock(blocks[0]) || !isQuoteLineBlock(blocks[1]) {
		t.Fatal("quote line blocks not recognised")
	}
}

func TestEnterSplitsParagraph(t *testing.T) {
	a := New()
	a.source = "# T\n\nfirst\n\nlast\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	rect, ok := tt.Find("first")
	if !ok {
		t.Fatalf("paragraph not found; texts = %q", tt.Texts())
	}
	tt.ClickAt(rect.X+rect.W+2, rect.Y+rect.H/2)
	tt.Frame()
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	tt.Type("new")
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if !strings.Contains(a.source, "first\n\nnew") || !strings.Contains(a.source, "new\n\nlast") {
		t.Fatalf("paragraph split = %q", a.source)
	}
}

func TestEnterSplitsListItem(t *testing.T) {
	a := New()
	a.source = "- one\n- two\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	rect, ok := tt.Find("one")
	if !ok {
		t.Fatalf("list item not found; texts = %q", tt.Texts())
	}
	tt.ClickAt(rect.X+rect.W+2, rect.Y+rect.H/2)
	tt.Frame()
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	tt.Type("new")
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if !strings.Contains(a.source, "- one\n- new") || !strings.Contains(a.source, "- new\n- two") {
		t.Fatalf("list split = %q", a.source)
	}
}

func TestEnterSplitsHeading(t *testing.T) {
	a := New()
	a.source = "# Title\n\npara\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	rect, ok := tt.Find("Title")
	if !ok {
		t.Fatalf("heading not found; texts = %q", tt.Texts())
	}
	tt.ClickAt(rect.X+rect.W+2, rect.Y+rect.H/2)
	tt.Frame()
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	tt.Type("body")
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if !strings.Contains(a.source, "# Title\n\nbody") {
		t.Fatalf("heading split = %q", a.source)
	}
}

func TestEnterSplitsQuoteLine(t *testing.T) {
	a := New()
	a.source = "> one\n> two\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	rect, ok := tt.Find("one")
	if !ok {
		t.Fatalf("quote not found; texts = %q", tt.Texts())
	}
	tt.ClickAt(rect.X+rect.W+2, rect.Y+rect.H/2)
	tt.Frame()
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	tt.Type("new")
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if !strings.Contains(a.source, "> one\n> new") || !strings.Contains(a.source, "> new\n> two") {
		t.Fatalf("quote split = %q", a.source)
	}
}

func TestShiftEnterKeepsParagraph(t *testing.T) {
	a := New()
	a.source = "# T\n\nfirst\n\nlast\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	rect, ok := tt.Find("first")
	if !ok {
		t.Fatalf("paragraph not found; texts = %q", tt.Texts())
	}
	tt.ClickAt(rect.X+rect.W+2, rect.Y+rect.H/2)
	tt.Frame()
	tt.Key(ui.Shift, ui.KeyEnter)
	tt.Frame()
	tt.Type("second")
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if !strings.Contains(a.source, "first  \nsecond") {
		t.Fatalf("hard break missing: %q", a.source)
	}
	if strings.Contains(a.source, "first\n\nsecond") {
		t.Fatalf("Shift+Enter split the paragraph: %q", a.source)
	}
}

func TestTabMovesToNextTableCellAndAppendsRow(t *testing.T) {
	a := New()
	a.source = "| name | state |\n| --- | --- |\n| mdoc | ok |\n"
	a.refreshDoc()
	a.startCellEdit(0, 1, 0)
	a.cellEdit.value = "X"
	a.moveCell(1)
	if !strings.Contains(a.source, "| X | ok |") {
		t.Fatalf("current cell not committed: %q", a.source)
	}
	if a.cellEdit == nil || a.cellEdit.col != 1 || a.cellEdit.value != "ok" {
		t.Fatalf("next cell = %+v", a.cellEdit)
	}
	a.moveCell(1)
	if a.cellEdit == nil || a.cellEdit.row != 2 || a.cellEdit.col != 0 {
		t.Fatalf("tab at end did not append a row: %+v", a.cellEdit)
	}
	if !strings.Contains(a.source, "|   |   |") {
		t.Fatalf("new row missing: %q", a.source)
	}
}

func TestTabKeyMovesTableCell(t *testing.T) {
	a := New()
	a.source = "| name | state |\n| --- | --- |\n| mdoc | ok |\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	rect, ok := tt.Find("mdoc")
	if !ok {
		t.Fatalf("cell not found; texts = %q", tt.Texts())
	}
	tt.ClickAt(rect.X+rect.W/2, rect.Y+rect.H/2)
	tt.Frame()
	tt.Type("X")
	tt.Frame()
	tt.Key(0, ui.KeyTab)
	tt.Frame()
	if a.cellEdit == nil || a.cellEdit.col != 1 {
		t.Fatalf("Tab did not move to the next cell: %+v", a.cellEdit)
	}
	if !strings.Contains(a.source, "X") {
		t.Fatalf("typed cell lost after Tab: %q", a.source)
	}
}

func TestCodeBlockContextMenuCopiesSource(t *testing.T) {
	a := New()
	a.source = "```go\nfmt.Println(1)\n```\n"
	a.refreshDoc()
	var copied string
	old := clipboardWrite
	clipboardWrite = func(s string) { copied = s }
	defer func() { clipboardWrite = old }()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if err := tt.RightClick("fmt.Println(1)"); err != nil {
		t.Fatalf("right click code: %v", err)
	}
	if err := tt.ChooseMenuItem("复制代码"); err != nil {
		t.Fatalf("choose copy code: %v", err)
	}
	if !strings.Contains(copied, "fmt.Println(1)") {
		t.Fatalf("copied %q", copied)
	}
}

func TestEditingPreservesSoftNewlines(t *testing.T) {
	a := New()
	a.source = "# T\n\nfirst line\nsecond line\n\nlast\n"
	a.refreshDoc()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if err := tt.Click("first line\nsecond line"); err != nil {
		t.Fatalf("click paragraph: %v (texts=%q)", err, tt.Texts())
	}
	tt.Frame()
	tt.Type("X")
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	normalized := strings.ReplaceAll(a.source, "  \n", "\n")
	if !strings.Contains(normalized, "first line\nsecond line") {
		t.Fatalf("newline lost while editing: %q", a.source)
	}
}
