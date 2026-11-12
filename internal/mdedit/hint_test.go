package mdedit

import (
	"testing"

	"github.com/egoist/mygo/ui"
)

// hintLayoutOf shapes the hint the editor would draw on the empty line l,
// as paintHint does: nil when there is no view to draw it in.
func hintLayoutOf(h *harness, l *leaf) *ui.TextLayout {
	return h.e.hintLayout(l, h.e.hint())
}

// TestTheEmptyTitleHintIsAsLargeAsTheTitle 空标题的「标题」两个字按标题的字号
// 画：打字之后标题就长在原地，不会从一行小字跳成大字。
//
// 量的是 hint 排版之后的行高，不是像素：像素要有装得下汉字的字体才画得出
// 来，而 CI 的 Linux runner 上一个中文字体都没装（只装了
// fonts-noto-color-emoji），那里的 hint 一个像素都不画，量像素的断言就在
// 那里红着——而编辑器自己是对的。行高是排版算出来的，与字体无关，在哪里
// 量都一样。
func TestTheEmptyTitleHintIsAsLargeAsTheTitle(t *testing.T) {
	h := titleHarness(t)
	l := h.e.leaves[0]
	lay := hintLayoutOf(h, l)
	if lay == nil {
		t.Fatal("the title's hint has no view to be drawn in")
	}
	_, lineH := lay.Size()
	// 一级标题的行高是字号的 1.35 倍（textFont），正文的是 1.75 倍 16px。
	title := h.e.lk.headingSize(1) * 1.35
	body := h.e.lk.size * h.e.lk.lh
	if lineH < title-1 || lineH > title+1 {
		t.Fatalf("the title's hint is %vpx tall, want the title's line at %v (the body's %v), not the body's",
			lineH, title, body)
	}
	if f := l.view.font; f.Size != h.e.lk.headingSize(1) || f.Weight != headingWeight(1) {
		t.Fatalf("the title's hint is %vpx weight %v, want %vpx weight %v",
			f.Size, f.Weight, h.e.lk.headingSize(1), headingWeight(1))
	}
}

// TestTheBodyHintIsAtTheBodySize 标题下面那行空正文的提示按正文的字号画：
// 它是正文的提示，不该跟着标题变大。
func TestTheBodyHintIsAtTheBodySize(t *testing.T) {
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
	lay := hintLayoutOf(h, body)
	if lay == nil {
		t.Fatal("the body's hint has no view to be drawn in")
	}
	_, lineH := lay.Size()
	bodyH := h.e.lk.size * h.e.lk.lh
	if lineH < bodyH-1 || lineH > bodyH+1 {
		t.Fatalf("the body's hint is %vpx tall, want the body's line at %v", lineH, bodyH)
	}
	// 标题那一行不能因此变小：两个提示各按自己那一行排。
	if f := body.view.font; f.Size != h.e.lk.size {
		t.Fatalf("the body's hint is %vpx, want the body's %vpx", f.Size, h.e.lk.size)
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
	// 提示要有得画：有 layout 才画得出字。这里不量像素——量像素要求机器上
	// 装着能画汉字的字体，CI 的 Linux runner 上一个都没有，那里量出来的 0
	// 是字体没装，不是编辑器没画。
	lay := hintLayoutOf(h, body)
	if lay == nil {
		t.Fatal("the empty line under the title draws no hint")
	}
	if w, _ := lay.Size(); w <= 0 {
		t.Fatal("the empty line under the title draws a hint of no width")
	}
}
