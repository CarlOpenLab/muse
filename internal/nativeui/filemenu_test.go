package nativeui

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestFileMenuListsCopyItems(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "one.md")
	if err := os.WriteFile(file, []byte("# One\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	a := New()
	a.setWorkspace(dir)
	old := clipboardWrite
	copied := ""
	clipboardWrite = func(s string) { copied = s }
	defer func() { clipboardWrite = old }()

	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if err := tt.RightClick("one.md"); err != nil {
		t.Fatalf("right click: %v", err)
	}
	items := tt.Menu()
	if len(items) == 0 {
		t.Fatal("context menu is empty")
	}
	if err := tt.ChooseMenuItem("复制相对路径"); err != nil {
		t.Fatalf("choose copy relative: %v", err)
	}
	if copied != "one.md" {
		t.Fatalf("copied %q, want one.md", copied)
	}
}
