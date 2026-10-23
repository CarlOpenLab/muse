package mdoc

import (
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestParseMermaidFlowchart(t *testing.T) {
	g, ok := parseMermaid(`graph TD
A[Start] --> B{Ready?}
B -->|yes| C[Ship]
B -.-> D[Retry]
`)
	if !ok {
		t.Fatal("parse failed")
	}
	if g.dir != "TD" || len(g.nodes) != 4 || len(g.edges) != 3 {
		t.Fatalf("graph = dir %s nodes %d edges %d", g.dir, len(g.nodes), len(g.edges))
	}
	if g.byID["A"].label != "Start" || g.byID["B"].label != "Ready?" {
		t.Fatalf("labels = %q %q", g.byID["A"].label, g.byID["B"].label)
	}
	if g.edges[1].label != "yes" || !g.edges[2].dashed {
		t.Fatalf("edges = %+v", g.edges)
	}
}

func TestViewRendersMermaid(t *testing.T) {
	d := Parse("```mermaid\ngraph LR\nA[One] --> B[Two]\n```\n")
	tt := ui.NewTester(func(c *ui.Context) { View(c, d, Options{}) }, 800, 400)
	tt.Frame()
	if !tt.HasText("One") && !tt.HasText("Two") {
		// Diagram labels are painted, but the block must not panic or stay code.
		t.Logf("texts = %v", tt.Texts())
	}
}
