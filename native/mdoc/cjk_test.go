package mdoc

import (
	"strings"
	"testing"
	"unicode/utf8"
)

// boldRuns returns the text of a paragraph's bold spans, joined by |.
func boldRuns(spans []Span) string {
	var out []string
	for _, s := range spans {
		if s.Bold {
			out = append(out, s.Text)
		}
	}
	return strings.Join(out, "|")
}

func TestStrongBesideCJKPunctuation(t *testing.T) {
	for _, c := range []struct{ src, text, bold string }{
		{"**注意：**这是**重点**内容。", "注意：这是重点内容。", "注意：|重点"},
		{"中文**（括号）**中文", "中文（括号）中文", "（括号）"},
		{"**English:**中文", "English:中文", "English:"},
		{"“我说**是**”", "“我说是”", "是"},
		{"**“名称”**：**值**", "“名称”：值", "“名称”|值"},
	} {
		d := Parse(c.src)
		p := d.Blocks[0].Inlines
		if got := spansText(p); got != c.text {
			t.Errorf("%q reads %q, want %q", c.src, got, c.text)
		}
		if got := boldRuns(p); got != c.bold {
			t.Errorf("%q has bold %q, want %q", c.src, got, c.bold)
		}
	}
	d := Parse("- **步骤一：**安装依赖\n- **步骤二：**运行\n")
	if it := d.Blocks[0].Items; len(it) != 2 || boldRuns(it[0].Inlines) != "步骤一：" || spansText(it[1].Inlines) != "步骤二：运行" {
		t.Errorf("list = %+v", d.Blocks[0])
	}
}

func TestCJKFriendlyKeepsOffsets(t *testing.T) {
	src := "**注意：**内容，**（括号）**中文，`**代码：**中`\n\n```\n**注意：**中文\n```\n"
	got := CJKFriendly(src)
	if len(got) != len(src) || got == src {
		t.Fatalf("CJKFriendly(%q) = %q", src, got)
	}
	for i := 0; i < len(src); {
		r, n := utf8.DecodeRuneInString(src[i:])
		if r < utf8.RuneSelf && got[i] != src[i] {
			t.Fatalf("ASCII at %d changed: %q", i, got[i])
		}
		if g, gn := utf8.DecodeRuneInString(got[i:]); gn != n || g == utf8.RuneError {
			t.Fatalf("character at %d changed length: %q for %q", i, g, r)
		}
		i += n
	}
	if plain := "No CJK here: **bold** and *em*."; CJKFriendly(plain) != plain {
		t.Fatal("text without CJK changed")
	}
	// The text of a code block is the source's.
	if d := Parse(src); d.Blocks[1].Text != "**注意：**中文\n" {
		t.Fatalf("code = %q", d.Blocks[1].Text)
	}
}

func TestParseResolvesEscapesAndReferences(t *testing.T) {
	d := Parse("\\*not em\\* a\\_b &amp; &copy; &#x4e2d; 1 \\< 2 `a\\_b` &bogus;\n")
	p := d.Blocks[0].Inlines
	if got := spansText(p); got != "*not em* a_b & © 中 1 < 2 a\\_b &bogus;" {
		t.Fatalf("text = %q", got)
	}
	if !hasCode(p, "a\\_b") {
		t.Fatalf("code lost its backslash: %+v", p)
	}
}
