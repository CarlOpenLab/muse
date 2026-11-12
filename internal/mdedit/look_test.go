package mdedit

import (
	"testing"

	"github.com/egoist/mygo/ui"
)

// lookOf builds a look for the theme dark reports, the way the editor does.
func lookOf(t *testing.T, dark bool) look {
	t.Helper()
	e := New("# 标题\n\n正文。", Options{FontSize: 16})
	tt := ui.NewTester(func(c *ui.Context) {
		e.View(c).Grow(1)
	}, 400, 300)
	tt.SetDark(dark)
	tt.Frame()
	tt.Frame()
	return e.lk
}

// TestPanelLetsTheCardThrough 表格、图片、引用背后的 panel 是编辑器内部的
// 一个表面，画在卡片上面。卡片本身现在是半透明的，panel 一旦不透明就在
// 亚克力上抠出一块实心：那一块的桌面材料再也透不出来，一张表格就能把卡片
// 打回不透明的样子。所以两个主题的 panel 都得是半透明的。
func TestPanelLetsTheCardThrough(t *testing.T) {
	for _, dark := range []bool{false, true} {
		lk := lookOf(t, dark)
		if lk.panel.A >= 255 {
			t.Fatalf("dark = %v: panel alpha = %d, want translucent", dark, lk.panel.A)
		}
	}
}

// TestPanelShowsAgainstTheCard panel 半透明之后还得在卡片上认得出：把它叠
// 在卡片底色上，与卡片底色必须差得开。深色主题里 panel 偏亮，浅色主题里偏
// 暗——它是一层 tint，方向由主题定，不是一块实心。
func TestPanelShowsAgainstTheCard(t *testing.T) {
	// 卡片底色与 appearance.go 的 cardColor 成对，改一个要记得改另一个。
	const (
		lightCard = "#ffffff"
		darkCard  = "#232328"
	)
	cases := []struct {
		dark bool
		card ui.Color
	}{
		{false, ui.Hex(lightCard)},
		{true, ui.Hex(darkCard)},
	}
	for _, tc := range cases {
		lk := lookOf(t, tc.dark)
		on := tc.card.Mix(lk.panel, float32(lk.panel.A)/255)
		if on == tc.card {
			t.Fatalf("dark = %v: panel over the card is indistinguishable: %v", tc.dark, on)
		}
	}
}
