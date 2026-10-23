package nativeui

import (
	"strings"

	"muse/mdoc"
)

// sourceBlock is one editable chunk of the Markdown source: the text between
// two blank lines, with fenced code kept whole. The editor renders each chunk
// on its own and turns just that chunk into an input while it is edited.
type sourceBlock struct {
	Start  int
	End    int
	Source string
	doc    *mdoc.Doc
}

type srcLine struct {
	start int
	end   int
	text  string
}

// splitSource cuts Markdown into top-level blocks. It is deliberately
// line-oriented: a block ends at a blank line, except inside a fenced code
// block, where blank lines are content. That keeps the editor's unit small and
// its replacement exact, rather than guessing offsets from a parsed tree.
func splitSource(src string) []sourceBlock {
	lines := sourceLines(src)
	var out []sourceBlock
	for i := 0; i < len(lines); {
		if strings.TrimSpace(lines[i].text) == "" {
			i++
			continue
		}
		start := lines[i].start
		fence, fenceLen := fenceOpen(lines[i].text)
		if fence != "" {
			j := i + 1
			for ; j < len(lines); j++ {
				if fenceCloses(lines[j].text, fence, fenceLen) {
					j++
					break
				}
			}
			if j > len(lines) {
				j = len(lines)
			}
			end := lines[j-1].end
			out = append(out, newSourceBlock(src, start, end))
			i = j
			continue
		}
		if isQuoteStart(lines[i].text) {
			// Each top-level quote line is its own editing unit; adjacent lines
			// sit flush so the quote's left rule stays continuous.
			out = append(out, newSourceBlock(src, lines[i].start, lines[i].end))
			i++
			continue
		}
		if isListStart(lines[i].text) {
			j := i + 1
			for j < len(lines) && strings.TrimSpace(lines[j].text) != "" && !isListStart(lines[j].text) && !isQuoteStart(lines[j].text) {
				if fence, n := fenceOpen(lines[j].text); fence != "" {
					j++
					for ; j < len(lines); j++ {
						if fenceCloses(lines[j].text, fence, n) {
							j++
							break
						}
					}
					continue
				}
				j++
			}
			end := lines[j-1].end
			out = append(out, newSourceBlock(src, start, end))
			i = j
			continue
		}
		j := i
		for j < len(lines) && strings.TrimSpace(lines[j].text) != "" {
			if j > i && (isListStart(lines[j].text) || isQuoteStart(lines[j].text)) {
				break
			}
			j++
		}
		end := lines[j-1].end
		out = append(out, newSourceBlock(src, start, end))
		i = j
	}
	return out
}

// isListStart reports a top-level list marker. Indented items belong to the
// item above them, so a whole nested list stays in one editable block.
func isQuoteStart(line string) bool {
	return strings.HasPrefix(line, ">")
}

func isListStart(line string) bool {
	if line == "" || line[0] == ' ' || line[0] == '\t' {
		return false
	}
	if (line[0] == '-' || line[0] == '*' || line[0] == '+') && len(line) > 1 && line[1] == ' ' {
		return true
	}
	i := 0
	for i < len(line) && i < 3 && line[i] >= '0' && line[i] <= '9' {
		i++
	}
	return i > 0 && i+1 < len(line) && (line[i] == '.' || line[i] == ')') && line[i+1] == ' '
}

func newSourceBlock(src string, start, end int) sourceBlock {
	text := src[start:end]
	return sourceBlock{Start: start, End: end, Source: text, doc: mdoc.Parse(text)}
}

func sourceLines(src string) []srcLine {
	var out []srcLine
	start := 0
	for i := 0; i <= len(src); i++ {
		if i < len(src) && src[i] != '\n' {
			continue
		}
		end := i
		text := src[start:end]
		if strings.HasSuffix(text, "\r") {
			text = strings.TrimSuffix(text, "\r")
		}
		out = append(out, srcLine{start: start, end: end, text: text})
		start = i + 1
	}
	// The loop above adds a final empty line after a trailing newline; drop it
	// so a document does not end in a phantom block.
	if n := len(out); n > 0 && out[n-1].start == len(src) {
		out = out[:n-1]
	}
	return out
}

func fenceOpen(line string) (string, int) {
	trimmed := strings.TrimLeft(line, " \t")
	for _, ch := range []string{"`", "~"} {
		if strings.HasPrefix(trimmed, strings.Repeat(ch, 3)) {
			n := 0
			for n < len(trimmed) && string(trimmed[n]) == ch {
				n++
			}
			return ch, n
		}
	}
	return "", 0
}

func fenceCloses(line, ch string, n int) bool {
	trimmed := strings.TrimLeft(line, " \t")
	m := 0
	for m < len(trimmed) && string(trimmed[m]) == ch {
		m++
	}
	return m >= n && strings.TrimSpace(trimmed[m:]) == ""
}
