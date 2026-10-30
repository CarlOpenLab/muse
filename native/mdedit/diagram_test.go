package mdedit

import (
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"
)

// wideDiagram is a Mermaid graph wider than the editor's column.
const wideDiagram = "```mermaid\ngraph LR\n" +
	"A[开始] --> B[解析]\n" +
	"B --> C[布局]\n" +
	"C --> D[绘制]\n" +
	"D --> E[校验]\n" +
	"E --> F[保存]\n" +
	"F --> G[完成]\n" +
	"```"

// diagramHarness returns a harness showing wideDiagram, and its leaf, with
// the caret outside the diagram so that it draws.
func diagramHarness(t *testing.T) (*harness, *leaf) {
	t.Helper()
	h := newHarness(t, wideDiagram+"\n\n尾\n")
	caret := len(h.e.Source())
	h.caretAt(caret)
	h.frame()
	l := h.e.leaves[0]
	if l.view == nil || l.view.diagram == nil {
		t.Fatal("the mermaid block did not draw as a diagram")
	}
	return h, l
}

func TestDiagramScrollsSideways(t *testing.T) {
	h, l := diagramHarness(t)
	v := l.view
	box, contentW := h.e.diagramBox(l, v, 0, 0)
	if contentW <= box.W {
		t.Fatalf("diagram width %v does not overflow the column %v", contentW, box.W)
	}
	if v.diagX != 0 {
		t.Fatalf("diagram starts scrolled: %v", v.diagX)
	}
	// A sideways swipe over the diagram scrolls it, not the document.
	h.tt.Scroll(box.X+30, box.Y+30, 120, 0)
	h.frame()
	if v.diagX <= 0 {
		t.Fatalf("swipe did not scroll the diagram: %v", v.diagX)
	}
	// It stops at the content's end.
	h.tt.Scroll(box.X+30, box.Y+30, contentW*2, 0)
	h.frame()
	if v.diagX != contentW-box.W {
		t.Fatalf("diagram scrolled to %v, want %v", v.diagX, contentW-box.W)
	}
	// Shift turns a wheel notch sideways, back toward the start. A wheel
	// event carries the modifiers the platform reports, which a Tester's
	// Wheel does not, so the event goes to the editor as it would come.
	h.e.scrollDiagram(ui.InputEvent{Kind: ui.InputScroll, X: box.X + 30, Y: box.Y + 30, DY: -60, Mods: ui.Shift})
	h.frame()
	if v.diagX >= contentW-box.W {
		t.Fatalf("Shift+wheel did not scroll the diagram back: %v", v.diagX)
	}
}

func TestDiagramScrollBarDrags(t *testing.T) {
	h, l := diagramHarness(t)
	v := l.view
	box, contentW := h.e.diagramBox(l, v, 0, 0)
	track, thumb := diagramBarRects(box, contentW, v.diagX)
	if !track.Contains(thumb.X+thumb.W/2, thumb.Y+1) {
		t.Fatal("the thumb is not on its track")
	}
	h.tt.Press(thumb.X+thumb.W/2, thumb.Y+1)
	h.frame()
	if h.e.diagDrag == nil {
		t.Fatal("pressing the bar did not start a drag")
	}
	h.tt.Move(track.X+track.W-1, track.Y+1)
	h.frame()
	h.tt.Release(track.X+track.W-1, track.Y+1)
	h.frame()
	if v.diagX != contentW-box.W {
		t.Fatalf("dragging the thumb to the end left the diagram at %v, want %v", v.diagX, contentW-box.W)
	}
	if h.e.diagDrag != nil {
		t.Fatal("letting go did not end the drag")
	}
}

func TestDiagramBarShowsOnlyOnOverflow(t *testing.T) {
	h := newHarness(t, "```mermaid\ngraph LR\nA[一] --> B[二]\n```\n\n尾\n")
	h.caretAt(len(h.e.Source()))
	h.frame()
	l := h.e.leaves[0]
	if l.view == nil || l.view.diagram == nil {
		t.Fatal("the mermaid block did not draw as a diagram")
	}
	box, contentW := h.e.diagramBox(l, l.view, 0, 0)
	if contentW > box.W {
		t.Fatalf("a small diagram overflows: %v > %v", contentW, box.W)
	}
	if _, _, _, _, ok := h.e.diagramBarAt(box.X+10, box.Y+box.H+4); ok {
		t.Fatal("a diagram that fits shows a scroll bar")
	}
}

// TestDiagramKeepsItsScroll proves the sideways scroll belongs to the
// view: editing another block leaves it alone.
func TestDiagramKeepsItsScroll(t *testing.T) {
	h, l := diagramHarness(t)
	v := l.view
	box, _ := h.e.diagramBox(l, v, 0, 0)
	h.tt.Scroll(box.X+30, box.Y+30, 90, 0)
	h.frame()
	at := v.diagX
	if at <= 0 {
		t.Fatal("the diagram did not scroll")
	}
	h.caretAt(len(h.e.Source()))
	h.typ("tail")
	h.frame()
	if l.view == nil || l.view.diagram == nil {
		t.Fatal("the diagram is gone")
	}
	if got := l.view.diagX; got != at {
		t.Fatalf("an edit outside the diagram moved its scroll from %v to %v", at, got)
	}
	if !strings.HasSuffix(h.e.Source(), "tail") {
		t.Fatal("the edit did not land")
	}
}
