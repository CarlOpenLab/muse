package nativeui

import (
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestHeadingEditKeepsFollowingContent(t *testing.T) {
	source := "# H1\n\n## H2\n\n### H3\n\nbody\n"
	for _, tc := range []struct {
		block  int
		anchor string
	}{
		{0, "H2"},
		{1, "H3"},
		{2, "body"},
	} {
		a := New()
		a.source = source
		a.refreshDoc()
		a.dirty = false
		before := ui.NewTester(a.View, 1200, 800)
		before.Frame()
		r1, ok1 := before.Find(tc.anchor)

		a.beginBlockEdit(tc.block)
		after := ui.NewTester(a.View, 1200, 800)
		after.Frame()
		r2, ok2 := after.Find(tc.anchor)

		if !ok1 || !ok2 {
			t.Fatalf("block %d: anchor %q not found (%v/%v)", tc.block, tc.anchor, ok1, ok2)
		}
		if r1.Y != r2.Y || r1.H != r2.H {
			t.Fatalf("block %d shifted %q: before=%+v after=%+v", tc.block, tc.anchor, r1, r2)
		}
	}
}

func TestLongHeadingEditKeepsFollowingContent(t *testing.T) {
	long := "这是一个非常长的标题，用来验证标题在编辑态与渲染态换行行高一致，不应该在点击进入编辑时把后续内容推来推去。"
	a := New()
	a.source = "# " + long + "\n\n## H2\n\nbody\n"
	a.refreshDoc()
	a.dirty = false
	before := ui.NewTester(a.View, 1200, 800)
	before.Frame()
	r1, ok1 := before.Find("H2")
	a.beginBlockEdit(0)
	after := ui.NewTester(a.View, 1200, 800)
	after.Frame()
	r2, ok2 := after.Find("H2")
	if !ok1 || !ok2 {
		t.Fatalf("anchor not found %v/%v", ok1, ok2)
	}
	if r1.Y != r2.Y || r1.H != r2.H {
		t.Fatalf("long heading shifted H2: before=%+v after=%+v", r1, r2)
	}
}
