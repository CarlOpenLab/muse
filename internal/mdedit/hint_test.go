package mdedit

import (
	"testing"

	"github.com/egoist/mygo/ui"
)

// inkRows counts the rows of a leaf's line that hold ink, pixels darker than
// the page, leaving out the caret at the line's start.
func inkRows(h *harness, l *leaf) int {
	img := h.tt.Image()
	r := h.e.elemRect
	x0, x1 := int(r.X+l.x)+4, int(r.X+l.x+l.w)
	y0, y1 := int(r.Y+l.y), int(r.Y+l.y+l.h)
	rows := 0
	for y := y0; y < y1; y++ {
		for x := x0; x < x1; x++ {
			if c := img.RGBAAt(x, y); c.R < 230 && c.G < 230 && c.B < 230 {
				rows++
				break
			}
		}
	}
	return rows
}

// TestTheEmptyTitleHintIsAsLargeAsTheTitle 空标题的「标题」两个字按标题的字号
// 画：打字之后标题就长在原地，不会从一行小字跳成大字。
func TestTheEmptyTitleHintIsAsLargeAsTheTitle(t *testing.T) {
	h := titleHarness(t)
	l := h.e.leaves[0]
	if rows := inkRows(h, l); float32(rows) < h.e.lk.size*1.5 {
		t.Fatalf("the title's hint is %d rows tall; want it at the title's %vpx, not the body's %vpx",
			rows, h.e.lk.headingSize(1), h.e.lk.size)
	}
}

// TestTheBodyUnderTheTitleShowsItsHint 标题写完回车，下面那行空正文画出
// 「开始写作…」：标题和正文各有各的提示。
func TestTheBodyUnderTheTitleShowsItsHint(t *testing.T) {
	h := titleHarness(t)
	h.typ("周报")
	h.key(0, ui.KeyEnter)
	var body *leaf
	for _, l := range h.e.leaves {
		if l.kind == kPhantom {
			body = l
		}
	}
	if body == nil {
		t.Fatal("Enter after the title opened no line")
	}
	if rows := inkRows(h, body); rows == 0 {
		t.Fatal("the empty line under the title draws no hint")
	}
}
