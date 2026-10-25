package nativeui

import (
	"testing"

	"github.com/egoist/mygo/ui"
)

// ⌘P 命令面板：打开 → 模糊过滤 → 运行选中命令。
func TestCommandPalette(t *testing.T) {
	a := New()
	a.setWorkspace(t.TempDir())

	a.openCommandPalette()
	if !a.cmdPalette {
		t.Fatal("面板未打开")
	}
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()

	// 模糊过滤 "主题" → 命中「切换主题」
	a.cmdValue = "主题"
	t.Logf("value=%q ncmds=%d", a.cmdValue, len(a.paletteCommands()))
	cands := a.paletteCandidates()
	t.Logf("cands=%d", len(cands))
	if len(cands) != 1 || cands[0].name != "切换主题" {
		t.Fatalf("过滤结果错误: %+v", cands)
	}
	before := a.themeMode
	a.cmdSel = 0
	a.applyCommandPalette()
	if a.cmdPalette {
		t.Fatal("运行后面板未关闭")
	}
	if a.themeMode == before {
		t.Fatal("切换主题命令未执行")
	}

	// 无匹配提示空候选，Esc 路径关闭
	a.openCommandPalette()
	a.cmdValue = "不存在的命令xyz"
	if len(a.paletteCandidates()) != 0 {
		t.Fatal("无匹配时应为空候选")
	}
	a.closeCommandPalette()
	if a.cmdPalette {
		t.Fatal("关闭失败")
	}

	// 默认第一项是「新建文档」：运行后 dirty 文档状态建立
	a.openCommandPalette()
	a.applyCommandPalette()
	if a.cmdPalette {
		t.Fatal("运行后面板未关闭")
	}
	// 新建文档 = 重置为空文档（path/source 清空）
	if a.path != "" || a.source != "" {
		t.Fatalf("新建文档命令未执行: path=%q source=%q", a.path, a.source)
	}
}
