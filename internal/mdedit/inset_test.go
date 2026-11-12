package mdedit

import (
	"testing"

	"github.com/egoist/mygo/ui"
)

// laidIn builds an editor in a view of the given width and reports where the
// text column sits, the way the shell does: no PadX, so the default applies.
func laidIn(t *testing.T, width int) *Editor {
	t.Helper()
	e := New("# 标题\n\n正文。", Options{FontSize: 16})
	tt := ui.NewTester(func(c *ui.Context) {
		e.View(c).Grow(1)
	}, width, 300)
	tt.Frame()
	tt.Frame()
	return e
}

// TestTextColumnKeepsAReadableInset 正文离卡片左右两边是 40px 的话，宽一点
// 的卡片里正文显得夹在中间很空，写作的每一行都短一截。默认留白要收到 24px：
// 仍然透气，但一行放得下更多字。
func TestTextColumnKeepsAReadableInset(t *testing.T) {
	// 卡片比正文列的限宽还窄时，留白是唯一在起作用的东西。
	const narrow = 700
	e := laidIn(t, narrow)
	if e.elemW == 0 {
		t.Fatal("the editor never measured its element")
	}
	if defaultPadX >= 40 {
		t.Fatalf("defaultPadX = %v, want under 40: the writing line was too short", defaultPadX)
	}
	// 留白要真的用上：正文列顶到两边留白，一点都不浪费。
	if got, want := e.colW, e.elemW-2*defaultPadX; got != want {
		t.Fatalf("the text column is %vpx wide, want %v with %vpx of padding on each side", got, want, defaultPadX)
	}
	// 留白两边要一样：正文在卡片里居中，不能偏。
	if left, right := e.colX, e.elemW-e.colX-e.colW; left != defaultPadX || right != defaultPadX {
		t.Fatalf("the column sits %v from the left and %v from the right, want %v on both sides", left, right, defaultPadX)
	}
}

// TestTextColumnStopsAtItsReadableWidth 正文列有自己的限宽：一行太长眼睛
// 扫回来找不到下一行。这一条守着那个上限，免得上面那条为了把留白用满把它
// 撑开——宽卡片里两边多出来的是限宽的余量，不是留白。
func TestTextColumnStopsAtItsReadableWidth(t *testing.T) {
	const wide = 1600
	e := laidIn(t, wide)
	if e.colW >= wide {
		t.Fatalf("the writing line runs the full %vpx; it must stop at a readable width", wide)
	}
	if left, right := e.colX, e.elemW-e.colX-e.colW; left != right {
		t.Fatalf("the column sits %v from the left and %v from the right; want it centred", left, right)
	}
}

// TestWideCardUsesTheRoomTheDragOpened 卡片拖宽之后，正文要用上那份房间：
// 限宽是给没拖过的默认窗口兜底的，不是把一张 1200px 的卡片也按 820px 排。
// 差 190px 不动的正文看起来像被卡在中间——拖动白拖了。
func TestWideCardUsesTheRoomTheDragOpened(t *testing.T) {
	const wide = 1202 // 截图里那张卡片的实测内宽
	e := laidIn(t, wide)
	// 卡片比限宽宽得多：正文列得顶到两边的留白，把卡片填满。
	want := e.elemW - 2*defaultPadX
	if got := e.colW; got != want {
		t.Fatalf("the writing line is %vpx in a %vpx card, want %v: the room the drag opened went unused", got, e.elemW, want)
	}
	if got := e.colW; got < wide-100 {
		t.Fatalf("the writing line is %vpx, want most of the %vpx card", got, wide)
	}
	// 宽出可读范围时仍然要收口：一条 3000px 宽的显示器不因此变一行 3000 字。
	const room = 1400
	if got := e.colW; got > room {
		t.Fatalf("the writing line is %vpx, want at most %v on a line of prose", got, room)
	}
}

// TestFullScreenCardDoesNotLeaveTheTextInAStraitjacket 1920x1080 的显示器
// 上卡片拉满，内宽约 1900px：上限若是 1300，正文两边各空 310px，比当初
// 820 的 190px 还空——屏幕上看起来就是中间窄窄一条。上限要放到连 1920
// 都吃得下，只剩一点边。
func TestFullScreenCardDoesNotLeaveTheTextInAStraitjacket(t *testing.T) {
	const screen = 1920
	e := laidIn(t, screen)
	// 两边最多剩 150px：再宽就是正文被夹在中间，拖动白拖。1700 的上限在
	// 1920 的卡片上剩 110，是留白加上限的余量，看着是齐边的。
	const slack = 150
	if left, right := e.colX, e.elemW-e.colX-e.colW; left > slack || right > slack {
		t.Fatalf("the writing line is %vpx on a %vpx card with %v and %vpx of space beside it, want at most %v on each side",
			e.colW, screen, left, right, slack)
	}
	// 但也不能一放了之：一行汉字过百就读不回来了，上限得留在可读范围里。
	if got := e.colW; got > 1700 {
		t.Fatalf("the writing line is %vpx, want at most 1700 on a line of prose", got)
	}
	// 两边要一样：正文在卡片里居中，不能偏。
	if left, right := e.colX, e.elemW-e.colX-e.colW; left != right {
		t.Fatalf("the column sits %v from the left and %v from the right; want it centred", left, right)
	}
}
