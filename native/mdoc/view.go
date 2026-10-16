package mdoc

import (
	"strings"

	"github.com/egoist/mygo/ui"
)

const (
	defBodySize = 15
	defPadding  = 24
	defIndent   = 18
)

// Options controls how a document is drawn natively.
type Options struct {
	// BodyFontSize is the size of body text in DIPs; 0 means 15.
	BodyFontSize float32
	// Font is the body font family; "" means the system's.
	Font string
	// MonoFont is the code font family; "" means "monospace".
	MonoFont string
	// Padding is the content padding in DIPs; 0 means 24.
	Padding float32
	// IndentStep is the nesting step for lists and quotes; 0 means 18.
	IndentStep float32
}

func (o Options) withDefaults() Options {
	if o.BodyFontSize == 0 {
		o.BodyFontSize = defBodySize
	}
	if o.MonoFont == "" {
		o.MonoFont = "monospace"
	}
	if o.Padding == 0 {
		o.Padding = defPadding
	}
	if o.IndentStep == 0 {
		o.IndentStep = defIndent
	}
	return o
}

// View draws the document natively: a scrollable column of blocks, built
// from the ui package with no webview and no frontend build.
func View(c *ui.Context, d *Doc, opts Options) ui.Element {
	if d == nil {
		return ui.Column(c)
	}
	s := rstyle{o: opts.withDefaults()}
	return ui.Scroll(c).Fill().Children(func() {
		ui.Column(c).FillWidth().Gap(10).Padding(s.o.Padding).Children(func() {
			renderBlocks(c, d.Blocks, 0, s)
		})
	})
}

// rstyle carries the resolved options plus the context a block renders in,
// so a quote's contents draw muted without a second options type.
type rstyle struct {
	o     Options
	muted bool
}

func (s rstyle) body(c *ui.Context) ui.Color {
	if s.muted {
		return c.Theme().TextMuted
	}
	return ui.Color{}
}

func renderBlocks(c *ui.Context, blocks []Block, depth int, s rstyle) {
	for _, b := range blocks {
		renderBlock(c, b, depth, s)
	}
}

func renderBlock(c *ui.Context, b Block, depth int, s rstyle) {
	t := c.Theme()
	switch b.Kind {
	case Heading:
		ui.RichText(c, uiSpans(c, b.Inlines, s)...).
			FontSize(headingSize(b.Level, s.o.BodyFontSize)).
			FontWeight(650).Wrap().LineHeight(1.3)
	case Paragraph:
		ui.RichText(c, uiSpans(c, b.Inlines, s)...).
			FontSize(s.o.BodyFontSize).Wrap().LineHeight(1.6)
	case Code:
		renderCode(c, b, s)
	case Quote:
		ui.Column(c).Gap(8).PaddingX(12).
			BorderWidth(0, 0, 0, 3).BorderColor(t.Border).
			Children(func() {
				renderBlocks(c, b.Children, depth+1, rstyle{o: s.o, muted: true})
			})
	case List:
		renderList(c, b, depth, s)
	case Rule:
		ui.Divider(c)
	case HTML:
		ui.RichText(c, ui.Span{Text: strings.TrimRight(b.Text, "\n"), Size: s.o.BodyFontSize - 1, Font: s.o.MonoFont, Color: t.TextMuted}).
			FontSize(s.o.BodyFontSize - 1).Wrap().LineHeight(1.5)
	case Table:
		renderTable(c, b, s)
	}
}

func renderCode(c *ui.Context, b Block, s rstyle) {
	ui.Column(c).Gap(2).Padding(10).Radius(6).Background(c.Theme().Surface).Children(func() {
		if b.Lang != "" {
			ui.Text(c, b.Lang).FontSize(s.o.BodyFontSize - 2).TextColor(c.Theme().TextMuted)
		}
		for _, line := range strings.Split(strings.TrimRight(b.Text, "\n"), "\n") {
			ui.Text(c, line).Font(s.o.MonoFont).FontSize(s.o.BodyFontSize - 1).Wrap()
		}
	})
}

func renderList(c *ui.Context, b Block, depth int, s rstyle) {
	ui.Column(c).Gap(4).Children(func() {
		for _, it := range b.Items {
			item := it
			ui.Row(c).Gap(8).Children(func() {
				ui.Text(c, item.Marker).FontSize(s.o.BodyFontSize).
					TextColor(c.Theme().TextMuted).MinWidth(18)
				ui.Column(c).Grow(1).Gap(6).Children(func() {
					ui.RichText(c, uiSpans(c, item.Inlines, s)...).
						FontSize(s.o.BodyFontSize).Wrap().LineHeight(1.5)
					if len(item.Children) > 0 {
						renderBlocks(c, item.Children, depth+1, s)
					}
				})
			})
		}
	})
}

func renderTable(c *ui.Context, b Block, s rstyle) {
	ui.Column(c).Gap(4).Children(func() {
		for i, row := range b.Rows {
			head := i == 0
			ui.Row(c).Gap(16).Children(func() {
				for _, cell := range row {
					el := ui.RichText(c, uiSpans(c, cell, s)...).
						FontSize(s.o.BodyFontSize).Wrap().Grow(1)
					if head {
						el.FontWeight(650)
					}
				}
			})
			if head {
				ui.Divider(c)
			}
		}
	})
}

// uiSpans converts model spans to ui spans, resolving links and code to the
// theme's accent and mono face.
func uiSpans(c *ui.Context, spans []Span, s rstyle) []ui.Span {
	t := c.Theme()
	out := make([]ui.Span, 0, len(spans))
	for _, sp := range spans {
		u := ui.Span{Text: sp.Text, Size: s.o.BodyFontSize}
		if s.muted {
			u.Color = t.TextMuted
		}
		if sp.Bold {
			u.Weight = 650
		}
		if sp.Italic {
			u.Italic = true
		}
		if sp.Strike {
			u.Strikethrough = true
		}
		if sp.Code {
			u.Font = s.o.MonoFont
			u.Background = t.Surface
		}
		if sp.Link != "" {
			u.Color = t.Accent
			u.Underline = true
		}
		out = append(out, u)
	}
	return out
}

func headingSize(level int, body float32) float32 {
	switch level {
	case 1:
		return body + 8
	case 2:
		return body + 5
	case 3:
		return body + 3
	case 4:
		return body + 1
	default:
		return body
	}
}