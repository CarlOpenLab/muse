package mdoc

import (
	"strconv"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	east "github.com/yuin/goldmark/extension/ast"
	"github.com/yuin/goldmark/text"
)

// parser is shared: goldmark's parser is safe for concurrent use and holds
// no per-call state.
var parser = goldmark.New(goldmark.WithExtensions(extension.GFM))

// Parse parses Markdown source into a document. It never fails: anything
// the parser cannot place is kept as a paragraph so no text is lost, which
// is what makes the same code path usable for plain .txt files.
func Parse(src string) *Doc {
	b := []byte(src)
	root := parser.Parser().Parse(text.NewReader(b))
	doc := &Doc{Source: src, Blocks: parseBlocks(root, b)}
	return doc
}

// ParseFile parses Markdown bytes, as read from disk.
func ParseFile(b []byte) *Doc { return Parse(string(b)) }

func parseBlocks(n ast.Node, src []byte) []Block {
	var out []Block
	for c := n.FirstChild(); c != nil; c = c.NextSibling() {
		if b, ok := parseBlock(c, src); ok {
			out = append(out, b)
		}
	}
	return out
}

func parseBlock(n ast.Node, src []byte) (Block, bool) {
	switch v := n.(type) {
	case *ast.Heading:
		return Block{Kind: Heading, Level: v.Level, Inlines: parseInlines(v, src, style{})}, true
	case *ast.Paragraph:
		return Block{Kind: Paragraph, Inlines: parseInlines(v, src, style{})}, true
	case *ast.TextBlock:
		return Block{Kind: Paragraph, Inlines: parseInlines(v, src, style{})}, true
	case *ast.FencedCodeBlock:
		return Block{Kind: Code, Lang: string(v.Language(src)), Text: linesText(v, src)}, true
	case *ast.CodeBlock:
		return Block{Kind: Code, Text: linesText(v, src)}, true
	case *ast.Blockquote:
		return Block{Kind: Quote, Children: parseBlocks(v, src)}, true
	case *ast.List:
		return parseList(v, src), true
	case *ast.ThematicBreak:
		return Block{Kind: Rule}, true
	case *ast.HTMLBlock:
		return Block{Kind: HTML, Text: linesText(v, src)}, true
	case *east.Table:
		return parseTable(v, src), true
	}
	// Unknown block: keep its text so nothing is lost.
	if t := nodeText(n, src); t != "" {
		return Block{Kind: Paragraph, Inlines: []Span{{Text: t}}}, true
	}
	return Block{}, false
}

func parseList(n *ast.List, src []byte) Block {
	b := Block{Kind: List, Ordered: n.IsOrdered(), Start: n.Start}
	num := n.Start
	for c := n.FirstChild(); c != nil; c = c.NextSibling() {
		li, ok := c.(*ast.ListItem)
		if !ok {
			continue
		}
		item := parseItem(li, src)
		if n.IsOrdered() {
			item.Marker = strconv.Itoa(num) + "."
			num++
		} else {
			item.Marker = "•"
		}
		b.Items = append(b.Items, item)
	}
	return b
}

func parseItem(li *ast.ListItem, src []byte) Item {
	var item Item
	for c := li.FirstChild(); c != nil; c = c.NextSibling() {
		switch c.(type) {
		case *ast.Paragraph, *ast.TextBlock:
			if len(item.Inlines) == 0 {
				item.Inlines = parseInlines(c, src, style{})
				continue
			}
		}
		if b, ok := parseBlock(c, src); ok {
			item.Children = append(item.Children, b)
		}
	}
	return item
}

func parseTable(n *east.Table, src []byte) Block {
	b := Block{Kind: Table}
	for _, a := range n.Alignments {
		b.Align = append(b.Align, alignOf(a))
	}
	for c := n.FirstChild(); c != nil; c = c.NextSibling() {
		switch row := c.(type) {
		case *east.TableHeader:
			b.Rows = append(b.Rows, tableRowCells(row, src))
		case *east.TableRow:
			b.Rows = append(b.Rows, tableRowCells(row, src))
		}
	}
	return b
}

// tableRowCells reads a row's cells. It accepts either a TableRow or a
// TableHeader, whose children are the cells directly.
func tableRowCells(n ast.Node, src []byte) []Cell {
	var cells []Cell
	for cell := n.FirstChild(); cell != nil; cell = cell.NextSibling() {
		if tc, ok := cell.(*east.TableCell); ok {
			cells = append(cells, Cell(parseInlines(tc, src, style{})))
		}
	}
	return cells
}

func alignOf(a east.Alignment) Align {
	switch a {
	case east.AlignLeft:
		return AlignLeft
	case east.AlignCenter:
		return AlignCenter
	case east.AlignRight:
		return AlignRight
	}
	return AlignNone
}

type style struct {
	bold, italic, code, strike bool
	link                       string
}

func parseInlines(n ast.Node, src []byte, st style) []Span {
	var out []Span
	var walk func(ast.Node, style)
	walk = func(node ast.Node, st style) {
		for c := node.FirstChild(); c != nil; c = c.NextSibling() {
			switch v := c.(type) {
			case *ast.Text:
				out = appendSpan(out, Span{Text: string(v.Segment.Value(src)),
					Bold: st.bold, Italic: st.italic, Code: st.code, Strike: st.strike, Link: st.link})
				if v.SoftLineBreak() {
					out = appendSpan(out, Span{Text: " ", Bold: st.bold, Italic: st.italic, Link: st.link})
				}
				if v.HardLineBreak() {
					out = appendSpan(out, Span{Text: "\n", Bold: st.bold, Italic: st.italic, Link: st.link})
				}
			case *ast.String:
				out = appendSpan(out, Span{Text: string(v.Value),
					Bold: st.bold, Italic: st.italic, Code: st.code, Strike: st.strike, Link: st.link})
			case *ast.CodeSpan:
				out = appendSpan(out, Span{Text: nodeText(v, src), Code: true,
					Bold: st.bold, Italic: st.italic, Strike: st.strike, Link: st.link})
			case *ast.Emphasis:
				ns := st
				if v.Level == 2 {
					ns.bold = true
				} else {
					ns.italic = true
				}
				walk(v, ns)
			case *ast.Link:
				ns := st
				ns.link = string(v.Destination)
				walk(v, ns)
			case *ast.AutoLink:
				out = appendSpan(out, Span{Text: string(v.Label(src)), Link: string(v.URL(src)),
					Bold: st.bold, Italic: st.italic})
			case *ast.Image:
				out = appendSpan(out, Span{Text: "🖼 " + nodeText(v, src), Italic: true, Link: string(v.Destination)})
			case *ast.RawHTML:
				// Inline HTML: shown as-is by the plain renderer.
				for i := 0; i < v.Segments.Len(); i++ {
					seg := v.Segments.At(i)
					out = appendSpan(out, Span{Text: string(seg.Value(src)), Code: true})
				}
			default:
				walk(c, st)
			}
		}
	}
	walk(n, st)
	return out
}

// appendSpan adds s, merging it into the previous span when their styles
// match, so the model carries runs rather than characters.
func appendSpan(out []Span, s Span) []Span {
	if s.Text == "" {
		return out
	}
	if n := len(out); n > 0 {
		p := &out[n-1]
		if p.Bold == s.Bold && p.Italic == s.Italic && p.Code == s.Code &&
			p.Strike == s.Strike && p.Link == s.Link {
			p.Text += s.Text
			return out
		}
	}
	return append(out, s)
}

// nodeText is the plain text of a subtree, used where styling is dropped
// (code spans, image alt text).
func nodeText(n ast.Node, src []byte) string {
	var b []byte
	_ = ast.Walk(n, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		switch v := node.(type) {
		case *ast.Text:
			b = append(b, v.Segment.Value(src)...)
		case *ast.String:
			b = append(b, v.Value...)
		}
		return ast.WalkContinue, nil
	})
	return string(b)
}

// linesText is the raw text of a node's lines (code blocks, HTML blocks).
func linesText(n ast.Node, src []byte) string {
	var b []byte
	l := n.Lines()
	for i := 0; i < l.Len(); i++ {
		seg := l.At(i)
		b = append(b, seg.Value(src)...)
	}
	return string(b)
}
