package nativeui

import (
	"strings"

	"github.com/egoist/mygo/ui"

	"muse/mdoc"
)

// markdownRanges styles the block editor's source the way Typora styles the
// block under the caret: markers stay visible but recede, and bold text and
// links already read with their rendered weight and color.
func markdownRanges(src string, t *ui.Theme) []ui.TextRange {
	runes := []rune(src)
	type style struct {
		color    ui.Color
		hasColor bool
		weight   int
	}
	st := make([]style, len(runes))
	setColor := func(a, b int, c ui.Color) {
		for i := a; i < b && i < len(st); i++ {
			if i >= 0 {
				st[i].color, st[i].hasColor = c, true
			}
		}
	}
	setWeight := func(a, b, w int) {
		for i := a; i < b && i < len(st); i++ {
			if i >= 0 {
				st[i].weight = w
			}
		}
	}

	// Headings are bold across the line; their hashes and list/quote markers
	// are muted.
	line := 0
	for line < len(runes) {
		end := line
		for end < len(runes) && runes[end] != '\n' {
			end++
		}
		i := line
		for i < end && i < line+4 && runes[i] == ' ' {
			i++
		}
		if i < end && runes[i] == '#' {
			for i < end && runes[i] == '#' {
				setColor(i, i+1, t.TextMuted)
				i++
			}
			setWeight(i, end, 600)
		} else if i < end && (runes[i] == '-' || runes[i] == '+' || runes[i] == '*' || runes[i] == '>') &&
			(i+1 == end || runes[i+1] == ' ') {
			setColor(i, i+1, t.TextMuted)
		}
		line = end + 1
	}

	for i := 0; i < len(runes); i++ {
		switch runes[i] {
		case '`':
			if j := indexRune(runes, '`', i+1); j >= 0 {
				setColor(i, i+1, t.TextMuted)
				setColor(j, j+1, t.TextMuted)
				setColor(i+1, j, t.Accent)
				i = j
			}
		case '*', '_':
			if i+1 < len(runes) && runes[i+1] == runes[i] {
				marker := string(runes[i : i+2])
				if j := indexString(runes, marker, i+2); j >= 0 {
					setColor(i, i+2, t.TextMuted)
					setColor(j, j+2, t.TextMuted)
					setWeight(i+2, j, 600)
					i = j + 1
				}
			}
		case '[':
			if j := indexRune(runes, ']', i+1); j >= 0 && j+1 < len(runes) && runes[j+1] == '(' {
				if k := indexRune(runes, ')', j+2); k >= 0 {
					setColor(i, i+1, t.TextMuted)
					setColor(j, j+1, t.TextMuted)
					setColor(j+1, k+1, t.TextMuted)
					setColor(i+1, j, t.Accent)
					i = k
				}
			}
		}
	}

	out := make([]ui.TextRange, 0, len(runes)/4)
	for i := 0; i < len(runes); {
		j := i + 1
		for j < len(runes) && st[j].color == st[i].color && st[j].hasColor == st[i].hasColor && st[j].weight == st[i].weight {
			j++
		}
		if st[i].hasColor || st[i].weight != 0 {
			r := ui.TextRange{Start: i, End: j}
			if st[i].hasColor {
				r.Color = st[i].color
			}
			if st[i].weight != 0 {
				r.Weight = st[i].weight
			}
			out = append(out, r)
		}
		i = j
	}
	return out
}

func indexRune(runes []rune, r rune, from int) int {
	for i := from; i < len(runes); i++ {
		if runes[i] == r {
			return i
		}
	}
	return -1
}

func indexString(runes []rune, s string, from int) int {
	needle := []rune(s)
	for i := from; i+len(needle) <= len(runes); i++ {
		ok := true
		for j, r := range needle {
			if runes[i+j] != r {
				ok = false
				break
			}
		}
		if ok {
			return i
		}
	}
	return -1
}

// codeRanges colors a code block's source while it is edited. The fenced
// lines stay plain; the code between them uses the same palette as the
// rendered block.
func codeRanges(src, lang string, t *ui.Theme) []ui.TextRange {
	var out []ui.TextRange
	offset := 0
	for _, line := range strings.Split(src, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~") {
			offset += len([]rune(line)) + 1
			continue
		}
		for _, sp := range mdoc.HighlightLine(line, lang, t.Dark) {
			n := len([]rune(sp.Text))
			if n > 0 && sp.Color != (ui.Color{}) {
				out = append(out, ui.TextRange{Start: offset, End: offset + n, Color: sp.Color})
			}
			offset += n
		}
		offset++
	}
	return out
}
