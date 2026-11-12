package nativeui

import (
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

// newTitled opens a new window and types title into its empty document.
func newTitled(t *testing.T, title string) *App {
	t.Helper()
	a := New()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Frame()
	a.ed.Focus()
	tt.Frame()
	tt.Type(title)
	tt.Frame()
	return a
}

// TestNewDocumentOpensOnATitle 新窗口里的空文档第一行就是标题：打的字存成
// 一级标题。
func TestNewDocumentOpensOnATitle(t *testing.T) {
	a := newTitled(t, "周报")
	if a.source != "# 周报" {
		t.Fatalf("source = %q, want the title as a level-one heading", a.source)
	}
}

// TestSaveOffersTheTitleAsTheFileName 第一次保存，文件名默认就是标题。
func TestSaveOffersTheTitleAsTheFileName(t *testing.T) {
	a := newTitled(t, "周报")
	offered := make(chan string, 1)
	old := saveDialog
	saveDialog = func(o mygo.SaveDialogOptions) (string, error) {
		offered <- o.DefaultPath
		return "", nil
	}
	defer func() { saveDialog = old }()
	a.save()
	select {
	case got := <-offered:
		if got != "周报.md" {
			t.Fatalf("the save dialog offers %q, want 周报.md", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("the save dialog never opened")
	}
}

// TestDiscardPromptOffersTheTitleAsTheFileName 新建、关窗时问「要保存吗」，
// 选保存，弹出来的保存框里也是标题当文件名。
func TestDiscardPromptOffersTheTitleAsTheFileName(t *testing.T) {
	a := newTitled(t, "周报")
	oldMsg, oldSave := messageDialog, saveDialog
	messageDialog = func(mygo.MessageOptions) (mygo.MessageResult, error) {
		return mygo.MessageResult{Button: 0}, nil
	}
	var offered string
	saveDialog = func(o mygo.SaveDialogOptions) (string, error) {
		offered = o.DefaultPath
		return "", nil
	}
	defer func() { messageDialog, saveDialog = oldMsg, oldSave }()
	if a.confirmDiscardOffUI() {
		t.Fatal("cancelling the save dialog still let the document go")
	}
	if offered != "周报.md" {
		t.Fatalf("the save dialog offers %q, want 周报.md", offered)
	}
}

// TestUntitledDocumentKeepsTheOldName 没写标题的文档还是 Untitled.md。
func TestUntitledDocumentKeepsTheOldName(t *testing.T) {
	a := New()
	if got := a.suggestedFileName(); got != "Untitled.md" {
		t.Fatalf("suggestedFileName() = %q, want Untitled.md", got)
	}
}

// TestFileNameOfATitle 标题里文件系统不收的字符换成空格，太长的截短，
// 只剩点和空格的不算名字。
func TestFileNameOfATitle(t *testing.T) {
	for _, c := range []struct{ title, want string }{
		{"周报", "周报"},
		{"Q3: 计划/复盘?", "Q3 计划 复盘"},
		{"  多  空格  ", "多 空格"},
		{"...", ""},
		{".NET 笔记", "NET 笔记"},
		{strings.Repeat("长", 100), strings.Repeat("长", 80)},
	} {
		if got := fileNameOf(c.title); got != c.want {
			t.Errorf("fileNameOf(%q) = %q, want %q", c.title, got, c.want)
		}
	}
}
