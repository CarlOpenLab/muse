package mdoc

import (
	"image"
	"image/draw"
	"strings"
)

// go-latex parses the AST for sup/sub but does not lay them out. When it
// returns an error for an expression containing ^ or _, Muse splits the
// expression at the first top-level script and composes the base, script and
// trailing text itself.
func renderScriptImage(expr string, size float64) (image.Image, error) {
	base, sup, sub, rest, ok := splitScript(expr)
	if !ok || strings.TrimSpace(base) == "" {
		return nil, errNoScripts
	}
	baseImg, err := renderMathImage(base, size)
	if err != nil {
		return nil, err
	}
	var supImg, subImg, restImg image.Image
	if sup != "" {
		supImg, err = renderMathImage(sup, size*0.68)
		if err != nil {
			return nil, err
		}
	}
	if sub != "" {
		subImg, err = renderMathImage(sub, size*0.68)
		if err != nil {
			return nil, err
		}
	}
	if strings.TrimSpace(rest) != "" {
		restImg, err = renderMathImage(strings.TrimLeft(rest, " "), size)
		if err != nil {
			return nil, err
		}
		if strings.HasPrefix(rest, " ") {
			restImg = padLeft(restImg, 6)
		}
	}
	scriptW := 0
	if supImg != nil {
		scriptW = supImg.Bounds().Dx()
	}
	if subImg != nil && subImg.Bounds().Dx() > scriptW {
		scriptW = subImg.Bounds().Dx()
	}
	baseW, baseH := baseImg.Bounds().Dx(), baseImg.Bounds().Dy()
	supH, subH := 0, 0
	if supImg != nil {
		supH = supImg.Bounds().Dy()
	}
	if subImg != nil {
		subH = subImg.Bounds().Dy()
	}
	restW := 0
	if restImg != nil {
		restW = restImg.Bounds().Dx()
	}
	baseY := supH
	totalW := baseW + scriptW + restW + 4
	totalH := baseY + baseH + subH/2
	if totalH < baseH+supH {
		totalH = baseH + supH
	}
	if totalW < baseW {
		totalW = baseW
	}
	dst := image.NewRGBA(image.Rect(0, 0, totalW, totalH))
	draw.Draw(dst, image.Rect(0, baseY, baseW, baseY+baseH), baseImg, image.Point{}, draw.Over)
	if supImg != nil {
		draw.Draw(dst, image.Rect(baseW+2, 0, baseW+2+supImg.Bounds().Dx(), supH), supImg, image.Point{}, draw.Over)
	}
	if subImg != nil {
		y := baseY + baseH - subH/3
		draw.Draw(dst, image.Rect(baseW+2, y, baseW+2+subImg.Bounds().Dx(), y+subH), subImg, image.Point{}, draw.Over)
	}
	if restImg != nil {
		rx := baseW + scriptW + 2
		draw.Draw(dst, image.Rect(rx, baseY, rx+restW, baseY+restImg.Bounds().Dy()), restImg, image.Point{}, draw.Over)
	}
	return dst, nil
}

func splitScript(expr string) (base, sup, sub, rest string, ok bool) {
	depth := 0
	for i := 0; i < len(expr); i++ {
		switch expr[i] {
		case '{':
			depth++
		case '}':
			if depth > 0 {
				depth--
			}
		case '^', '_':
			if depth != 0 {
				continue
			}
			base = expr[:i]
			j := i
			for j < len(expr) && (expr[j] == '^' || expr[j] == '_') {
				marker := expr[j]
				content, next := scriptContent(expr, j+1)
				if content == "" {
					return "", "", "", "", false
				}
				if marker == '^' {
					sup = content
				} else {
					sub = content
				}
				j = next
			}
			rest = expr[j:]
			return base, sup, sub, rest, true
		}
	}
	return "", "", "", "", false
}

func scriptContent(expr string, i int) (content string, next int) {
	if i >= len(expr) {
		return "", i
	}
	if expr[i] == '{' {
		depth := 0
		for j := i; j < len(expr); j++ {
			switch expr[j] {
			case '{':
				depth++
			case '}':
				depth--
				if depth == 0 {
					return expr[i+1 : j], j + 1
				}
			}
		}
		return "", i
	}
	return string(expr[i]), i + 1
}

func padLeft(img image.Image, n int) image.Image {
	w := img.Bounds().Dx()
	h := img.Bounds().Dy()
	dst := image.NewRGBA(image.Rect(0, 0, w+n, h))
	draw.Draw(dst, image.Rect(n, 0, n+w, h), img, image.Point{}, draw.Over)
	return dst
}

type noScriptsError struct{}

func (noScriptsError) Error() string { return "no top-level scripts" }

var errNoScripts = noScriptsError{}
