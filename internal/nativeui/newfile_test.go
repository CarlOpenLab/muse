package nativeui

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/egoist/mygo/ui"
)

// 新建文件（面板工具栏）→ 文件落盘 → 自动打开：整条链路一次走通。
func TestNewFileToolbarCreatesAndOpens(t *testing.T) {
	dir := t.TempDir()
	a := New()
	a.root = dir

	tt := ui.NewTester(a.View, 1200, 800)
	if err := tt.Click("新建文件"); err != nil {
		t.Fatalf("点击新建文件失败: %v", err)
	}

	created := filepath.Join(dir, "未命名.md")
	if _, err := os.Stat(created); err != nil {
		t.Fatalf("文件未创建: %v", err)
	}
	if a.path != created {
		t.Fatalf("新文件未自动打开: path=%q", a.path)
	}
	if a.source != "" {
		t.Fatalf("新文件应为空内容, got %q", a.source)
	}

	// 再点新建文件夹
	if err := tt.Click("新建文件夹"); err != nil {
		t.Fatalf("点击新建文件夹失败: %v", err)
	}
	if info, err := os.Stat(filepath.Join(dir, "新建文件夹")); err != nil || !info.IsDir() {
		t.Fatalf("文件夹未创建: %v", err)
	}
}
