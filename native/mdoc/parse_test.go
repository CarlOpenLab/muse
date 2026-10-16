package mdoc

import (
	"strings"
	"testing"
)

func TestParseBlocks(t *testing.T) {
	src := "# Title\n\nHello **world** and `code`.\n\n- one\n- two\n\n> quoted\n\n```go\nfmt.Println(1)\n```\n\n---\n"
	d := Parse(src)

	want := []Kind{Heading, Paragraph, List, Quote, Code, Rule}
	if len(d.Blocks) != len(want) {
		t.Fatalf("got %d blocks, want %d: %+v", len(d.Blocks), len(want), d.Blocks)
	}
	for i, k := range want {
		if d.Blocks[i].Kind != k {
			t.Errorf("block %d kind = %v, want %v", i, d.Blocks[i].Kind, k)
		}
	}

	if h := d.Blocks[0]; h.Level != 1 || spansText(h.Inlines) != "Title" {
		t.Errorf("heading = level %d %q", h.Level, spansText(h.Inlines))
	}
	if p := d.Blocks[1]; !hasBold(p.Inlines, "world") || !hasCode(p.Inlines, "code") {
		t.Errorf("paragraph lost styling: %+v", p.Inlines)
	}
	if l := d.Blocks[2]; l.Ordered || len(l.Items) != 2 || spansText(l.Items[0].Inlines) != "one" {
		t.Errorf("list = %+v", l)
	}
	if q := d.Blocks[3]; len(q.Children) != 1 || spansText(q.Children[0].Inlines) != "quoted" {
		t.Errorf("quote = %+v", q)
	}
	if cd := d.Blocks[4]; cd.Lang != "go" || cd.Text != "fmt.Println(1)\n" {
		t.Errorf("code = %q lang %q", cd.Text, cd.Lang)
	}
}

func TestParseOrderedListAndTable(t *testing.T) {
	d := Parse("1. first\n2. second\n\n| a | b |\n|---|---|\n| 1 | 2 |\n")

	l := d.Blocks[0]
	if !l.Ordered || l.Items[0].Marker != "1." || l.Items[1].Marker != "2." {
		t.Errorf("ordered list = %+v", l)
	}
	tbl := d.Blocks[1]
	if tbl.Kind != Table || len(tbl.Rows) != 2 || spansText(tbl.Rows[0][0]) != "a" {
		t.Errorf("table = %+v", tbl)
	}
}

// Markdown semantics: a wrapped source line is one paragraph, joined by a
// space rather than a break.
func TestParseSoftBreakJoinsWithSpace(t *testing.T) {
	d := Parse("just text\nand more\n")
	if len(d.Blocks) != 1 || d.Blocks[0].Kind != Paragraph {
		t.Fatalf("blocks = %+v", d.Blocks)
	}
	if got := d.PlainText(); got != "just text and more\n" {
		t.Errorf("markdown soft break = %q", got)
	}
}

// A plain .txt file must open too: ParsePlainText keeps every line and
// shows Markdown syntax literally, so the same viewer serves both types.
func TestParsePlainTextKeepsLines(t *testing.T) {
	d := ParsePlainText("# not a heading\nplain line\r\n")
	if len(d.Blocks) != 2 {
		t.Fatalf("blocks = %d, want 2: %+v", len(d.Blocks), d.Blocks)
	}
	if got := d.PlainText(); got != "# not a heading\nplain line\n" {
		t.Errorf("plain text = %q", got)
	}
}

func TestPlainTextKeepsNesting(t *testing.T) {
	d := Parse("- outer\n  - inner\n")
	got := d.PlainText()
	if !strings.Contains(got, "• outer") || !strings.Contains(got, "  • inner") {
		t.Errorf("nested list text = %q", got)
	}
}

func hasBold(spans []Span, text string) bool {
	for _, s := range spans {
		if s.Bold && strings.Contains(s.Text, text) {
			return true
		}
	}
	return false
}

func hasCode(spans []Span, text string) bool {
	for _, s := range spans {
		if s.Code && strings.Contains(s.Text, text) {
			return true
		}
	}
	return false
}
