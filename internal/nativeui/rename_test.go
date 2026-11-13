package nativeui

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

func TestHeaderRenamesStandaloneDocumentAndSavesToNewPath(t *testing.T) {
	t.Setenv("MUSE_CONFIG_DIR", t.TempDir())
	dir := t.TempDir()
	old := filepath.Join(dir, "原名.md")
	if err := os.WriteFile(old, []byte("# 正文标题\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	a := New()
	a.applyOpen(old, "# 正文标题\n")
	a.loadDoc("# 正文标题\n\n尚未保存的正文")
	a.dirty = true
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Frame()
	if !tt.HasText("原名") {
		t.Fatal("the header should show the document name without .md")
	}
	if err := tt.Click("重命名当前文档"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	tt.Frame()
	if !a.renameOpen || a.renameValue != "原名" || !tt.Focused("新名称") {
		t.Fatalf("rename dialog not ready: open=%v value=%q focus=%v", a.renameOpen, a.renameValue, tt.Focused("新名称"))
	}
	tt.Key(ui.Cmd, ui.KeyA)
	tt.Type("新名称")
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	next := filepath.Join(dir, "新名称.md")
	if a.renameOpen || a.path != next || a.selectedPath != next {
		t.Fatalf("rename did not follow the document: open=%v path=%q selection=%q error=%q", a.renameOpen, a.path, a.selectedPath, a.renameError)
	}
	if !a.dirty || a.source != "# 正文标题\n\n尚未保存的正文" {
		t.Fatal("rename lost unsaved edits or changed the Markdown title")
	}
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Fatalf("old path still exists: %v", err)
	}
	if got := loadRecents(); len(got) != 1 || got[0].Path != next {
		t.Fatalf("recent entry was not updated: %+v", got)
	}
	a.save()
	data, err := os.ReadFile(next)
	if err != nil || string(data) != a.source || a.dirty {
		t.Fatalf("save after rename: data=%q err=%v dirty=%v", data, err, a.dirty)
	}
}

func TestRenameRejectsConflictsAndInvalidNames(t *testing.T) {
	t.Setenv("MUSE_CONFIG_DIR", t.TempDir())
	dir := t.TempDir()
	old, occupied := filepath.Join(dir, "原名.md"), filepath.Join(dir, "已有.md")
	for _, path := range []string{old, occupied} {
		if err := os.WriteFile(path, []byte(path), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	a := New()
	a.applyOpen(old, "# 标题")
	for _, name := range []string{"", "  ", ".", "..", "../移走", "sub/file", `sub\file`, "有\x00空字符", "已有", "已有.md"} {
		t.Run(name, func(t *testing.T) {
			a.beginRename(old)
			a.renameValue = name
			a.applyRename()
			if !a.renameOpen || a.renameError == "" || a.path != old {
				t.Fatalf("invalid rename accepted: path=%q open=%v error=%q", a.path, a.renameOpen, a.renameError)
			}
			for _, path := range []string{old, occupied} {
				data, err := os.ReadFile(path)
				if err != nil || string(data) != path {
					t.Fatalf("file changed: %q, %q, %v", path, data, err)
				}
			}
		})
	}
	// A rejected name can be corrected without reopening the dialog;
	// entering an extension explicitly must not duplicate it.
	a.renameValue = "新的名字.md"
	a.applyRename()
	if a.path != filepath.Join(dir, "新的名字.md") || a.renameOpen {
		t.Fatalf("retry failed: path=%q error=%q", a.path, a.renameError)
	}
}

func TestRenameFolderFollowsOpenDocument(t *testing.T) {
	t.Setenv("MUSE_CONFIG_DIR", t.TempDir())
	root := t.TempDir()
	old := filepath.Join(root, "旧文件夹")
	if err := os.Mkdir(old, 0o755); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(old, "笔记.md")
	if err := os.WriteFile(file, []byte("# 标题"), 0o644); err != nil {
		t.Fatal(err)
	}
	a := New()
	a.setWorkspace(root)
	a.applyOpen(file, "# 标题")
	a.expanded[old] = true
	a.beginRename(old)
	a.renameValue = "新文件夹"
	a.applyRename()
	next := filepath.Join(root, "新文件夹")
	if a.path != filepath.Join(next, "笔记.md") || a.selectedPath != a.path || !a.expanded[next] {
		t.Fatalf("folder rename lost document state: path=%q selection=%q expanded=%v", a.path, a.selectedPath, a.expanded)
	}
	if _, err := os.Stat(a.path); err != nil {
		t.Fatal(err)
	}
}

func TestHeaderNameCancelAndEscapeLeaveFileUnchanged(t *testing.T) {
	path := filepath.Join(t.TempDir(), "保留.MD")
	if err := os.WriteFile(path, []byte("# 标题"), 0o644); err != nil {
		t.Fatal(err)
	}
	a := New()
	a.applyOpen(path, "# 标题")
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	for _, cancel := range []bool{true, false} {
		a.beginRename(path)
		tt.Frame()
		tt.Frame()
		if cancel {
			if err := tt.Click("取消"); err != nil {
				t.Fatal(err)
			}
		} else {
			tt.Key(0, ui.KeyEscape)
		}
		tt.Frame()
		if a.renameOpen || a.path != path {
			t.Fatalf("cancel changed document: open=%v path=%q", a.renameOpen, a.path)
		}
	}
	a.beginRename(path)
	a.renameValue = "修改后"
	a.applyRename()
	if a.path != filepath.Join(filepath.Dir(path), "修改后.MD") {
		t.Fatalf("extension spelling was not preserved: %q", a.path)
	}
}

func TestUntitledHeaderOffersSaveWithBodyTitle(t *testing.T) {
	a := newTitled(t, "本周计划")
	offered := make(chan string, 1)
	old := saveDialog
	saveDialog = func(o mygo.SaveDialogOptions) (string, error) {
		offered <- o.DefaultPath
		return "", nil
	}
	defer func() { saveDialog = old }()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if err := tt.Click("命名并保存文档"); err != nil {
		t.Fatal(err)
	}
	select {
	case name := <-offered:
		if name != "本周计划.md" {
			t.Fatalf("save offered %q", name)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("clicking the untitled header did not offer saving")
	}
}
