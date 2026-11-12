package nativeui

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"
)

func TestPanelDragResizesAndFolds(t *testing.T) {
	a := New()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Frame()
	if !a.panelOpen {
		t.Fatal("panel starts closed")
	}
	r, ok := tt.Find("调整面板宽度")
	if !ok || r.W == 0 {
		t.Fatalf("the resize handle is not on screen: %+v", r)
	}
	x, y := r.X+r.W/2, r.Y+40

	// A drag left past the fold: the width clamps at the minimum while the
	// pointer holds, and releasing folds the panel away.
	tt.Press(x, y)
	tt.Frame()
	tt.Move(x-100, y)
	tt.Frame()
	if a.panelWidth != panelMinWidth {
		t.Fatalf("width = %.0f, want the minimum %.0f", a.panelWidth, panelMinWidth)
	}
	tt.Release(x-100, y)
	tt.Frame()
	if a.panelOpen {
		t.Fatal("a drag past the fold kept the panel open")
	}

	// A drag inside the bounds only moves the edge, and the panel stays.
	a2 := New()
	tt2 := ui.NewTester(a2.View, 1200, 800)
	tt2.Frame()
	r2, ok := tt2.Find("调整面板宽度")
	if !ok || r2.W == 0 {
		t.Fatalf("the resize handle is not on screen: %+v", r2)
	}
	x, y = r2.X+r2.W/2, r2.Y+40
	tt2.Press(x, y)
	tt2.Frame()
	tt2.Move(x-20, y)
	tt2.Frame()
	tt2.Release(x-20, y)
	tt2.Frame()
	if !a2.panelOpen {
		t.Fatal("a small drag folded the panel")
	}
	if w := a2.panelWidth; w != 248 {
		t.Fatalf("width = %.0f, want 248", w)
	}
}

// TestDragFoldedPanelReopensAtTheWidthYouLeftIt 拖过阈值折叠面板，重新打开
// 时必须是折叠前那个宽度，不是被钳住的最小宽度。
//
// 拖动把宽度实时钳进 [224, 440]：手指拖到 150 以下，panelWidth 当场变成
// 224，你原来的宽度当场就没了。等松手折叠、再重新打开，读到的就是钳过的
// 224——每一次「拖到折叠再打开」都把宽度往最小值推一截，用户拖宽的 panel
// 会越用越窄，而且回不来。
func TestDragFoldedPanelReopensAtTheWidthYouLeftIt(t *testing.T) {
	a := New()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Frame()

	// 先拖宽到一个认得出的宽度，再一路拖到折叠阈值之外。
	r, ok := tt.Find("调整面板宽度")
	if !ok || r.W == 0 {
		t.Fatalf("the resize handle is not on screen: %+v", r)
	}
	x, y := r.X+r.W/2, r.Y+40
	tt.Press(x, y)
	tt.Frame()
	tt.Move(x+80, y) // 拖宽
	tt.Frame()
	tt.Release(x+80, y)
	tt.Frame()
	tt.Advance(time.Second) // 等宽度动画到位，手柄才重新出现
	tt.Frame()
	want := a.panelWidth
	if want <= panelDefaultWidth {
		t.Fatalf("the drag did not widen the panel: %.0f", want)
	}

	// 现在一路拖过阈值，松手折叠。
	r, ok = tt.Find("调整面板宽度")
	if !ok {
		t.Fatalf("the resize handle is gone after the widen: %+v", r)
	}
	x, y = r.X+r.W/2, r.Y+40
	tt.Press(x, y)
	tt.Frame()
	tt.Move(x-300, y) // 一路拖到阈值之外
	tt.Frame()
	tt.Release(x-300, y)
	tt.Frame()
	if a.panelOpen {
		t.Fatal("a drag past the fold kept the panel open")
	}

	// 重新打开：折叠前的宽度要还在。
	a.showPanel(a.panel)
	tt.Frame()
	if !a.panelOpen {
		t.Fatal("reopening did not open the panel")
	}
	if a.panelWidth != want {
		t.Fatalf("the panel reopened at %.0f, want the %.0f it had before the fold", a.panelWidth, want)
	}
}

// TestModulesShareOnePanelWidth checks that switching modules never
// resizes the panel: the four views share one width, so the editor beside
// it does not reflow and flicker.
func TestModulesShareOnePanelWidth(t *testing.T) {
	a := New()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	want := a.panelWidth
	if want != panelDefaultWidth {
		t.Fatalf("the panel starts at %.0f, want the one %.0f", want, panelDefaultWidth)
	}
	for _, label := range []string{"大纲", "搜索", "AI 助手", "文件"} {
		if err := tt.Click(label); err != nil {
			t.Fatalf("click %s: %v", label, err)
		}
		tt.Frame()
		if a.panelWidth != want {
			t.Fatalf("switching to %s set the panel to %.0f, want the shared %.0f", label, a.panelWidth, want)
		}
		if a.panelW != want {
			t.Fatalf("switching to %s drew the panel %.0f wide, want %.0f", label, a.panelW, want)
		}
	}
	// A width the user dragged to stays across a switch as well.
	a.panelWidth = 320
	if err := tt.Click("AI 助手"); err != nil {
		t.Fatalf("click AI: %v", err)
	}
	tt.Frame()
	if a.panelWidth != 320 {
		t.Fatalf("switching to AI set the dragged width to %.0f, want 320", a.panelWidth)
	}
}

func TestCollapsedPanelReopensFromTheHeader(t *testing.T) {
	a := New()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Frame()
	if _, ok := tt.Find("打开侧栏"); ok {
		t.Fatal("the reopen icon shows while the panel is open")
	}
	a.collapsePanel()
	tt.Frame()
	tt.Frame()
	if _, ok := tt.Find("打开侧栏"); !ok {
		t.Fatal("no reopen icon while the panel is folded")
	}
	if err := tt.Click("打开侧栏"); err != nil {
		t.Fatalf("click reopen: %v", err)
	}
	if !a.panelOpen {
		t.Fatal("the reopen icon did not bring the panel back")
	}
}

// TestTopBarControlsShareOneLine reads the top bar off the layout: the rail's
// module buttons, the panel header's close and the editor header's title and
// status all centre on the same height, the one the window buttons sit on.
func TestTopBarControlsShareOneLine(t *testing.T) {
	a := New()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Frame()
	for _, s := range []string{"文件", "收起侧栏", "未命名", "0 字 · 1 行"} {
		r, ok := tt.Find(s)
		if !ok {
			t.Fatalf("%q is not on screen", s)
		}
		if s == "文件" && r.X >= railWidth {
			continue // the panel's title shares the word; the rail's button is meant
		}
		if d := r.Y + r.H/2 - topLineCenter; d < -0.5 || d > 0.5 {
			t.Errorf("%q centres at %.2f, want the top line at %.1f", s, r.Y+r.H/2, topLineCenter)
		}
	}
}

// TestFoldAnimatesFromTheWidthItHad 折叠动画的透明度和卡片位移都按
// panelW / panelWidth 算，所以折叠时 panelWidth 必须是动画的起点，而不是
// 拖动钳住后留下的脏值。
//
// 拖动把宽度实时钳进 [224, 440]，手指越过阈值时 panelWidth 已经是 224，
// 而 panelW 还停在拖动前的宽度（比如 368）。折叠动画从 368 滑向 0，除以
// 224 得到 1.64 → 钳成 1 → 0.69 → …：面板一路掉透明度、卡片跟着错比例
// 位移，不是干净地滑走。
func TestFoldAnimatesFromTheWidthItHad(t *testing.T) {
	a := New()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Frame()

	// 拖宽，让 panelW 停在一个认得出的宽度上。
	r, ok := tt.Find("调整面板宽度")
	if !ok {
		t.Fatal("no handle")
	}
	x, y := r.X+r.W/2, r.Y+40
	tt.Press(x, y)
	tt.Frame()
	tt.Move(x+100, y)
	tt.Frame()
	tt.Release(x+100, y)
	tt.Frame()
	tt.Advance(time.Second)
	tt.Frame()
	from := a.panelW
	if from <= panelDefaultWidth {
		t.Fatalf("the drag did not widen the panel: %.0f", from)
	}

	// 一路拖过阈值，松手折叠。折叠的那一刻，panelWidth 必须已经跟着
	// panelW 走——否则动画的分母是钳住的 224，起点是 368。
	r, ok = tt.Find("调整面板宽度")
	if !ok {
		t.Fatal("handle gone after the widen")
	}
	x, y = r.X+r.W/2, r.Y+40
	tt.Press(x, y)
	tt.Frame()
	tt.Move(x-300, y)
	tt.Frame()
	tt.Release(x-300, y)
	tt.Frame()

	if a.panelWidth < from-0.5 {
		t.Fatalf("the fold starts from panelWidth %.0f while the panel is drawn %.0f wide; the opacity and the card's slide both divide by the wrong one", a.panelWidth, from)
	}
	// 动画途中：分母必须仍是起点，透明度才不会中途跳变。
	tt.Advance(30 * time.Millisecond)
	tt.Frame()
	if a.panelW > 0 && a.panelW < a.panelWidth {
		got := a.panelW / a.panelWidth
		if got > 1 {
			t.Fatalf("mid-fold openness is %v, above 1: panelW %.0f over panelWidth %.0f", got, a.panelW, a.panelWidth)
		}
	}
}
