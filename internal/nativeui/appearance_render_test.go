package nativeui

import (
	"testing"

	"github.com/egoist/mygo/ui"
)

// TestCardBackgroundIsTranslucent 卡片底色必须半透明，否则桌面材料再强调
// 也透不出来：卡片这块是不透明的，亚克力就只在轨道与面板后面有。
func TestCardBackgroundIsTranslucent(t *testing.T) {
	a := New()
	a.cardOpacityPref = 0.5
	got := a.cardColor(false)
	if got.A >= 255 {
		t.Fatalf("light card alpha = %d, want translucent", got.A)
	}
	got = a.cardColor(true)
	if got.A >= 255 {
		t.Fatalf("dark card alpha = %d, want translucent", got.A)
	}
}

// TestCardBackgroundFollowsTheme 卡片色由明暗主题的色板定死：能调的只有
// 透多少（不透明度），颜色本身不开放选择，否则长时间阅读的对比度要靠用户
// 自己调对。
func TestCardBackgroundFollowsTheme(t *testing.T) {
	a := New()
	a.cardOpacityPref = 0.5
	light, dark := a.cardColor(false), a.cardColor(true)
	if light == dark {
		t.Fatalf("light and dark card colors are the same: %v", light)
	}
	if light.R != 255 || light.G != 255 || light.B != 255 {
		t.Fatalf("light card = %v, want white", light)
	}
	if dark.R != 0x23 || dark.G != 0x23 || dark.B != 0x28 {
		t.Fatalf("dark card = %v, want #232328", dark)
	}
}

// TestCardBackgroundAtFullOpacity 拖到 100% 卡片应当完全不透明，和改动前
// 一样——这一档是给「材料太花，我要实心」的人留的。
func TestCardBackgroundAtFullOpacity(t *testing.T) {
	a := New()
	a.cardOpacityPref = 1
	if got := a.cardColor(false); got.A != 255 {
		t.Fatalf("alpha = %d, want 255", got.A)
	}
}

// TestCardBackgroundTracksOpacity 不透明度变，底色要跟着变：滑杆拖着走的
// 时候每一帧都得取到新值。
func TestCardBackgroundTracksOpacity(t *testing.T) {
	a := New()
	a.cardOpacityPref = 0.3
	low := a.cardColor(false)
	a.cardOpacityPref = 0.9
	high := a.cardColor(false)
	if low.A >= high.A {
		t.Fatalf("alpha did not rise with opacity: %d then %d", low.A, high.A)
	}
}

// TestSettingsShowAppearanceRows 外观页要真的摆出不透明度与材料强度两个
// 控件，否则这两个值只能在配置文件里改。
func TestSettingsShowAppearanceRows(t *testing.T) {
	a := New()
	a.openSettings()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if err := tt.Click("外观"); err != nil {
		t.Fatalf("open appearance page: %v", err)
	}
	tt.Frame()
	for _, want := range []string{"卡片不透明度", "背景材料"} {
		if !tt.HasText(want) {
			t.Fatalf("missing %q; texts = %q", want, tt.Texts())
		}
	}
	for _, want := range []string{"无", "弱", "中", "强"} {
		if !tt.HasText(want) {
			t.Fatalf("missing blur choice %q; texts = %q", want, tt.Texts())
		}
	}
}

// TestCardLeftFollowsDrag 拖卡片左边缘要改卡片的宽度，面板的宽度一点都不
// 动：缝是卡片与面板之间裂开的，不是面板被推走。
func TestCardLeftFollowsDrag(t *testing.T) {
	a := New()
	a.showPanel(panelFiles)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Frame()

	panelBefore := a.panelWidth
	before, ok := tt.Find("调整卡片宽度")
	if !ok || before.W == 0 {
		t.Fatalf("the card resize handle is not on screen: %+v", before)
	}

	x, y := before.X+before.W/2, before.Y+40
	tt.Press(x, y)
	tt.Frame()
	tt.Move(x+60, y)
	tt.Frame()
	tt.Release(x+60, y)
	tt.Frame()

	after, ok := tt.Find("调整卡片宽度")
	if !ok {
		t.Fatal("the card resize handle vanished after the drag")
	}
	if a.panelWidth != panelBefore {
		t.Fatalf("panel width moved from %v to %v; the gap must be the card's", panelBefore, a.panelWidth)
	}
	if after.X <= before.X {
		t.Fatalf("the card's left edge stayed at %v, want > %v after a rightward drag", after.X, before.X)
	}
	if a.cardWidth() == 0 {
		t.Fatal("cardWidth = 0; the drag was not recorded")
	}
}

// TestCardLeftKeepsTrackingThePointer 拖动要一路跟手：一次拖动跨过下限之
// 后，指针继续往右，卡片得继续变宽。若拖动的起点取的是没拖过时的那 8px，
// 一越过下限就被钳住，之后再拖多远卡片都不动——手柄像粘在屏幕上。
func TestCardLeftKeepsTrackingThePointer(t *testing.T) {
	a := New()
	a.showPanel(panelFiles)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Frame()

	start, ok := tt.Find("调整卡片宽度")
	if !ok {
		t.Fatal("the card resize handle is not on screen")
	}
	x, y := start.X+start.W/2, start.Y+40
	tt.Press(x, y)
	tt.Frame()

	// 两次拖动之间隔一帧：卡片每次都从当前宽度接着走，而不是从某个固定的
	// 起点重算。两次都在面板让出的范围里，碰不到右边界。
	tt.Move(x+120, y)
	tt.Frame()
	first := a.cardWidth()
	tt.Move(x+200, y)
	tt.Frame()
	second := a.cardWidth()
	tt.Release(x+200, y)
	tt.Frame()

	if second <= first {
		t.Fatalf("cardWidth = %v after the second move, want > %v: the drag stopped tracking", second, first)
	}
	// 两次移动差 80px，卡片宽度就得差 80px：起点跟着卡片走，不跟着某个
	// 写死的偏移走。
	if want := first + 80; second != want {
		t.Fatalf("cardWidth = %v, want %v (80px past the first move)", second, want)
	}
}

// TestCardLeftNeverGoesBelowFloor 卡片拖得太窄一行放不了几个字，写作就没有
// 意义了：下限要守住，而且是拖动自己的钳位在守（clampCardLeft），不是把窄
// 卡片当成「没拖过」弹回去——那会让一次拖到头的手感变成回弹。
func TestCardLeftNeverGoesBelowFloor(t *testing.T) {
	const window = float32(1200)
	a := New()
	tt := ui.NewTester(a.View, int(window), 800)
	tt.Frame()
	tt.Frame()

	start, ok := tt.Find("调整卡片宽度")
	if !ok {
		t.Fatal("the card resize handle is not on screen")
	}
	x, y := start.X+start.W/2, start.Y+40
	tt.Press(x, y)
	tt.Frame()
	origin := a.cardLeft(nil)
	// 面板关着，往左拖到底：卡片贴到轨道右边就停，但停住不是弹回去。
	tt.Move(x-origin, y)
	tt.Frame()
	tt.Release(x-origin, y)
	tt.Frame()

	if got := a.cardWidth(); got == 0 {
		t.Fatal("cardWidth = 0: a drag that hit the floor was treated as never dragged")
	}
	if got := a.cardLeft(nil); got != a.cardWidth() {
		t.Fatalf("the card's left edge is at %v, want %v where the drag left it", got, a.cardWidth())
	}
	if room := window - a.cardWidth(); room < cardMinWidth {
		t.Fatalf("the card is left %vpx wide, want at least %v", room, cardMinWidth)
	}
}

// TestCardGapNeverCoversThePanel 卡片向右拖到底也盖不住面板：卡片在面板右
// 边，它俩之间那道缝是 gap，最小是 0，所以「盖住」在几何上不可能发生。这
// 条守着的是真正会坏的那种情况——拖动一路跟手，不会在中途被钳住不动。
func TestCardGapNeverCoversThePanel(t *testing.T) {
	const window = float32(1200)
	a := New()
	a.showPanel(panelFiles)
	tt := ui.NewTester(a.View, int(window), 800)
	tt.Frame()
	tt.Frame()

	start, ok := tt.Find("调整卡片宽度")
	if !ok {
		t.Fatal("the card resize handle is not on screen")
	}
	x, y := start.X+start.W/2, start.Y+40
	tt.Press(x, y)
	tt.Frame()
	// 按下时卡片左边缘在哪，拖动就该从哪儿接着算。
	origin := a.cardLeft(nil)
	// 一路往右拖，中间不松手：卡片要一路跟着指针走，不能被某个上限钉在
	// 半路。拖到头卡片还剩 cardMinWidth，那是它唯一该停的地方。
	far := window - canvasPadding - cardMinWidth
	for step := float32(40); step <= far-origin; step += 40 {
		tt.Move(x+step, y)
		tt.Frame()
		if got, want := a.cardWidth(), origin+step; got != want {
			t.Fatalf("after dragging %vpx cardWidth = %v, want %v: the drag stopped tracking", step, got, want)
		}
	}
	tt.Move(x+far-origin+400, y)
	tt.Frame()
	if got := a.cardWidth(); got != far {
		t.Fatalf("dragged past the room: cardWidth = %v, want %v", got, far)
	}
	// 到头卡片还得剩一整行能写字的地方。
	if window-far < cardMinWidth {
		t.Fatalf("the card is left %vpx wide, want at least %v", window-far, cardMinWidth)
	}
	tt.Release(x+far-origin+400, y)
	tt.Frame()
}
