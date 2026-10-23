package nativeui

import "strings"

// codeFenceParts splits a fenced code block into the opening line, the code
// body and the closing fence. The editor sees only the body; the fences are
// block chrome.
func codeFenceParts(src string) (prefix, body, suffix string) {
	if !(strings.HasPrefix(src, "```") || strings.HasPrefix(src, "~~~")) {
		return "", src, ""
	}
	nl := strings.IndexByte(src, '\n')
	if nl < 0 {
		return "", src, ""
	}
	prefix = src[:nl+1]
	body = src[nl+1:]
	last := strings.LastIndexByte(body, '\n')
	if last >= 0 {
		line := strings.TrimSpace(body[last+1:])
		if strings.HasPrefix(line, "```") || strings.HasPrefix(line, "~~~") {
			suffix = body[last:]
			body = body[:last]
		}
	}
	return prefix, body, suffix
}

func nextListPrefix(prefix string) string {
	// Keep the leading indentation, then increment the first ordered marker.
	i := 0
	for i < len(prefix) && (prefix[i] == ' ' || prefix[i] == '\t') {
		i++
	}
	j := i
	for j < len(prefix) && prefix[j] >= '0' && prefix[j] <= '9' {
		j++
	}
	if j == i || j >= len(prefix) || (prefix[j] != '.' && prefix[j] != ')') {
		return prefix
	}
	n := 0
	for k := i; k < j; k++ {
		n = n*10 + int(prefix[k]-'0')
	}
	return prefix[:i] + itoa(n+1) + prefix[j:]
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	p := len(buf)
	for n > 0 {
		p--
		buf[p] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[p:])
}

// mathFenceParts splits $$...$$ block math into hidden fences and the TeX
// body the editor exposes.
func mathFenceParts(src string) (prefix, body, suffix string) {
	s := strings.TrimSpace(src)
	if !strings.HasPrefix(s, "$$") {
		return "", src, ""
	}
	if strings.HasPrefix(s, "$$\n") {
		prefix = "$$\n"
		body = s[3:]
		if strings.HasSuffix(body, "\n$$") {
			body = strings.TrimSuffix(body, "\n$$")
			suffix = "\n$$"
		} else if strings.HasSuffix(body, "$$") {
			body = strings.TrimSuffix(body, "$$")
			suffix = "$$"
		}
		return prefix, body, suffix
	}
	if strings.HasSuffix(s, "$$") {
		return "$$", s[2 : len(s)-2], "$$"
	}
	return "", src, ""
}
