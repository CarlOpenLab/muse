package nativeui

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

func TestNativeShellRendersMarkdown(t *testing.T) {
	a := New()
	a.loadDoc("# 标题\n\n正文 **加粗**。\n\n- 一\n- 二\n")
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Frame()
	if len(a.headings) != 1 || a.headings[0].text != "标题" {
		t.Fatalf("headings = %+v", a.headings)
	}
	// The document is drawn by the editor: each of its blocks has a place
	// on the surface.
	for _, want := range []string{"标题", "正文", "加粗", "一", "二"} {
		off := strings.Index(a.source, want)
		if _, _, ok := a.ed.WindowPoint(off); !ok {
			t.Fatalf("%q has no place in the editor", want)
		}
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
	if a.source != "# One\n\nFirst.\n" {
		t.Fatalf("source = %q", a.source)
	}
}

func TestPanelToolbarButtonsShareOneRow(t *testing.T) {
	a := New()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	modules := []string{"文件", "大纲", "搜索", "AI 助手"}
	prevRight := float32(-1)
	var y float32
	var firstX float32
	for _, label := range modules {
		r, ok := tt.Find(label)
		if !ok {
			t.Fatalf("toolbar button %q missing", label)
		}
		if r.X <= prevRight {
			t.Fatalf("%q starts at x=%.1f, want after previous button at %.1f", label, r.X, prevRight)
		}
		if y == 0 {
			y = r.Y
		} else if r.Y != y {
			t.Fatalf("%q is at y=%.1f, want the toolbar row at %.1f", label, r.Y, y)
		}
		prevRight = r.X + r.W
		if firstX == 0 {
			firstX = r.X
		}
	}
	if firstX < railWidth+canvasPadding || firstX > railWidth+canvasPadding+12 {
		t.Fatalf("module toolbar starts at x=%.1f, want it aligned to the panel's left inset", firstX)
	}
	for _, label := range []string{"切换到深色", "设置"} {
		r, ok := tt.Find(label)
		if !ok {
			t.Fatalf("bottom rail button %q missing", label)
		}
		if r.X < panelDefaultWidth-railButtonSize*2-8 {
			t.Fatalf("bottom control %q is too far left at x=%.1f", label, r.X)
		}
		if r.W != 26 || r.H != 26 {
			t.Fatalf("bottom control %q is %gx%g, want 26x26 like the collapse button", label, r.W, r.H)
		}
	}
}

func TestRailSelectsModulesAndHeaderCollapses(t *testing.T) {
	a := New()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if !a.panelOpen {
		t.Fatal("panel should start open")
	}
	if err := tt.Click("AI 助手"); err != nil {
		t.Fatalf("click AI: %v", err)
	}
	tt.Frame()
	if a.panel != panelAI || !a.panelOpen {
		t.Fatalf("panel = %v, open = %v", a.panel, a.panelOpen)
	}
	// The active module is a view switch now: a second click (or a
	// double-click) must not hide the panel.
	tt.Advance(time.Second)
	if err := tt.Click("AI 助手"); err != nil {
		t.Fatalf("click AI again: %v", err)
	}
	tt.Frame()
	if !a.panelOpen {
		t.Fatal("clicking the active rail icon collapsed the panel")
	}
	// The header icon is the only rail-side collapse.
	tt.Advance(time.Second)
	if err := tt.Click("收起侧栏"); err != nil {
		t.Fatalf("collapse: %v", err)
	}
	tt.Frame()
	if a.panelOpen {
		t.Fatal("the header icon did not collapse the panel")
	}
	// 折叠把整条侧栏（图标列和面板）都收走了，重新打开只剩编辑器标题行
	// 里那个唤回键。
	tt.Advance(time.Second)
	tt.Frame()
	if err := tt.Click("打开侧栏"); err != nil {
		t.Fatalf("reopen from the editor header: %v", err)
	}
	tt.Advance(time.Second) // 等轨道展开动画走完
	tt.Frame()
	// 唤回键把你刚才在看的那个模块带回来，不是硬切回文件。
	want := a.panel
	if !a.panelOpen || a.panel != want {
		t.Fatalf("reopen: panel = %v, open = %v", a.panel, a.panelOpen)
	}
	if a.railW < railWidth-0.5 {
		t.Fatalf("the rail did not come back with the panel: railW=%.0f", a.railW)
	}
}

// TestThemeSwitchForcesTheAppAppearance checks that the app's own acrylic
// and title bar follow the theme it draws, not the desktop's appearance:
// the material behind the rail and the panel is the system's, and would
// stay light in a dark app otherwise. The first frame asks for the theme
// in use, an unchanged frame asks for nothing, and every switch asks for
// the new one.
func TestThemeSwitchForcesTheAppAppearance(t *testing.T) {
	prev := setAppAppearance
	var asked []mygo.ThemeSource
	setAppAppearance = func(s mygo.ThemeSource) { asked = append(asked, s) }
	t.Cleanup(func() { setAppAppearance = prev })

	a := New()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Frame()
	a.themeMode = 1
	tt.Frame()
	a.themeMode = 0
	tt.Frame()
	want := []mygo.ThemeSource{mygo.ThemeLight, mygo.ThemeDark, mygo.ThemeLight}
	if !slices.Equal(asked, want) {
		t.Fatalf("appearance requests = %v, want %v", asked, want)
	}
}

func TestDarkThemeRenders(t *testing.T) {
	a := New()
	a.loadDoc("# 标题\n\n正文。\n\n```go\nx := 1\n```\n")
	a.themeMode = 1
	tt := ui.NewTester(a.View, 1200, 800)
	tt.SetDark(true)
	tt.Frame()
	tt.Frame()
	if !a.dark {
		t.Fatal("the dark theme is not on")
	}
	if _, _, ok := a.ed.WindowPoint(strings.Index(a.source, "正文")); !ok {
		t.Fatal("the document is not laid out in the dark theme")
	}
}

func TestPanelCollapseAndReopenAnimate(t *testing.T) {
	a := New()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if a.panelW != a.panelWidth {
		t.Fatalf("panel starts at %.1f, want %.1f", a.panelW, a.panelWidth)
	}
	a.collapsePanel()
	tt.Frame()
	tt.Advance(30 * time.Millisecond)
	if a.panelW <= 0 || a.panelW >= a.panelWidth {
		t.Fatalf("the panel did not slide closed: width %.1f", a.panelW)
	}
	tt.Advance(time.Second)
	if a.panelW != 0 {
		t.Fatalf("panel width = %.1f after the slide, want 0", a.panelW)
	}
	a.showPanel(panelOutline)
	tt.Frame() // the frame that retargets the animation
	tt.Advance(30 * time.Millisecond)
	if a.panelW <= 0 {
		t.Fatal("reopening did not start the slide")
	}
}
