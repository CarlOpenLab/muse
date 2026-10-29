package nativeui

import (
	"testing"

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
