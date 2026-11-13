package nativeui

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/egoist/mygo/ui"
)

// TestSettingsShowsWhereTheMarkdownDefaultLives 在没有 .app 的测试运行里，
// 设置页把用户带到系统真正改关联的地方：Finder 的「显示简介」，而那个窗口
// 必须挂在一个真实文件上。打包后的 Muse 会多一个「设为默认」按钮，那条路径
// 由 TestSettingMuseAsDefault* 覆盖；这里守的是没有 bundle 时的退路。
func TestSettingsShowsWhereTheMarkdownDefaultLives(t *testing.T) {
	t.Setenv("MUSE_CONFIG_DIR", t.TempDir())
	dir := t.TempDir()
	p := filepath.Join(dir, "周报.md")
	if err := os.WriteFile(p, []byte("# 周报\n"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	// 先打开一个文档：这一行揭示的是正在编辑的那个文件，没有文档时它
	// 明说「先保存文档」，按钮不出现。
	a := New()
	a.openPathNow(p)
	a.openSettings()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if !tt.HasText("Markdown 默认打开方式") {
		t.Fatalf("the settings page does not name the markdown default; texts = %q", tt.Texts())
	}
	// 它得说清楚改关联的地方在哪，还得真的给一个能点的动作：一个只说
	// 「系统设置里可以改」却指不出是哪里的开关，和没有一样。
	if !tt.HasText("打开方式") {
		t.Fatalf("the settings page does not name where the system changes it; texts = %q", tt.Texts())
	}
	if !tt.HasText("在 Finder 中显示") {
		t.Fatalf("the settings page offers no way to get there; texts = %q", tt.Texts())
	}
}

// TestRevealInFinderNamesTheFileItWillReveal 这一行揭示的是当前正在编辑的
// 那个文件，不是别的。空的未命名文档没有路径，这时什么都不揭示——没有文件
// 可揭示，弹一个空窗口是说谎。
func TestRevealInFinderNamesTheFileItWillReveal(t *testing.T) {
	t.Setenv("MUSE_CONFIG_DIR", t.TempDir())
	dir := t.TempDir()
	p := filepath.Join(dir, "周报.md")
	if err := os.WriteFile(p, []byte("# 周报\n"), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}

	var got string
	a := New()
	a.revealMarkdownInFinder = func(path string) { got = path }
	a.openPathNow(p)
	// 打开文档本身不揭示任何东西：揭示是用户点了那一行才发生的事。
	if got != "" {
		t.Fatalf("opening a document revealed %q, want nothing until the row is clicked", got)
	}
	a.revealCurrentMarkdown()
	if got != p {
		t.Fatalf("revealing revealed %q, want the document at %q", got, p)
	}

	// 没有文档时揭示不了：路径是空的，就不该有任何东西被揭示。
	got = "<untouched>"
	a2 := New()
	a2.revealMarkdownInFinder = func(path string) { got = path }
	a2.revealCurrentMarkdown()
	if got != "<untouched>" {
		t.Fatalf("revealing with no document open revealed %q, want nothing at all", got)
	}
}
