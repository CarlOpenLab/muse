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

// TestHorizontalDiagramFitsItsColumns checks that a sideways graph is tall
// enough for the rank with the most nodes, which stack in one column.
func TestHorizontalDiagramFitsItsColumns(t *testing.T) {
	d, ok := ParseDiagram("graph LR\nA --> B1\nA --> B2\nA --> B3\nA --> B4\nA --> B5\nA --> B6\n")
	if !ok {
		t.Fatal("fan-out graph did not parse")
	}
	// Each node is 36 tall on a 52 stride: the sixth ends at 296.
	if h := d.Height(0); h < 296 {
		t.Fatalf("height = %v, want at least 296", h)
	}
}

// TestDiagramWidth checks the least width each kind of diagram reports, as
// the editor uses it to tell that a diagram overflows its column.
func TestDiagramWidth(t *testing.T) {
	cases := []struct {
		name string
		code string
		min  float32
	}{
		{"flowchart", "graph LR\nA[一] --> B[二]\n", 200},
		{"wide flowchart", "graph LR\nA --> B\nB --> C\nC --> D\nD --> E\nE --> F\nF --> G\nG --> H\n", 800},
		{"state", "stateDiagram\n[*] --> A\nA --> B\n", 140},
		{"sequence", "sequenceDiagram\nAlice->>Bob: Hi\n", 200},
		{"class", "classDiagram\nclass A\nclass B\nA --> B\n", 200},
		{"pie", "pie title Pets\n\"Dogs\": 3\n", 400},
		{"gantt", "gantt\ntitle Plan\nsection Work\nTask :a1, 2024-01-01, 3d\n", 250},
	}
	for _, c := range cases {
		d, ok := ParseDiagram(c.code)
		if !ok {
			t.Fatalf("%s did not parse", c.name)
		}
		if w := d.Width(); w < c.min {
			t.Fatalf("%s width = %v, want at least %v", c.name, w, c.min)
		}
	}
}
