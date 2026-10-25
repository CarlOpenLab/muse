package nativeui

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/egoist/mygo/ui"
)

// ⌘O 模糊跳转：打开面板 → 输入过滤 → Enter/点击打开目标文件。
func TestQuickOpenFuzzyJump(t *testing.T) {
	dir := t.TempDir()
	os.Mkdir(filepath.Join(dir, "子"), 0o755)
	os.WriteFile(filepath.Join(dir, "笔记A.md"), []byte("# A"), 0o644)
	os.WriteFile(filepath.Join(dir, "子", "笔记B.md"), []byte("# B"), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "aardvark.txt"), []byte("x"), 0o644)

	a := New()
	a.setWorkspace(dir)

	// 无查询时列出全部文件，Enter 打开选中项
	a.openQuickOpen()
	if !a.quickOpen {
		t.Fatal("面板未打开")
	}
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if a.quickOpenSel != 0 {
		t.Fatalf("默认选中应为 0, got %d", a.quickOpenSel)
	}
	a.applyQuickOpen()
	if a.quickOpen {
		t.Fatal("打开后面板未关闭")
	}
	// 无查询按路径排序，aardvark.txt 排最前
	if a.path != filepath.Join(dir, "aardvark.txt") {
		t.Fatalf("Enter 应打开第一个候选: path=%q", a.path)
	}

	// 展开子目录后 "B" 模糊命中 子/笔记B.md（相对路径评分，
	// 绝对路径里的字符不算命中——aardvark.txt 不应混进来）
	a.openQuickOpen()
	a.expanded[filepath.Join(dir, "子")] = true
	a.quickOpenValue = "B"
	cands := a.quickOpenCandidates()
	if len(cands) != 1 || filepath.Base(cands[0].path) != "笔记B.md" {
		t.Fatalf("过滤结果错误: %+v", cands)
	}
	a.quickOpenSel = 0
	a.applyQuickOpen()
	if a.path != filepath.Join(dir, "子", "笔记B.md") {
		t.Fatalf("应打开模糊命中的笔记B: path=%q", a.path)
	}

	// ↑↓ 选中候选后 Enter：无查询按路径字节序，index 1 是 子/笔记B
	a.openQuickOpen()
	tt.Frame()
	a.quickOpenSel = 1
	a.applyQuickOpen()
	if a.quickOpen || a.path != filepath.Join(dir, "子", "笔记B.md") {
		t.Fatalf("选中项应打开并关闭面板: path=%q open=%v", a.path, a.quickOpen)
	}
}
