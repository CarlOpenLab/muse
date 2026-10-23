package mdoc

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"strings"
	"sync"

	"github.com/egoist/mygo/ui"
	"github.com/go-latex/latex/drawtex/drawimg"
	"github.com/go-latex/latex/mtex"
)

// mathDPI is the rasterisation density; the bitmap is displayed at 72/DPI of
// its pixel size, so formulas stay sharp without being giant.
const mathDPI = 192.0

type mathRender struct {
	bmp *ui.Bitmap
}

var (
	mathCache sync.Map
	mathMu    sync.Mutex
)

// mathBitmap typesets a TeX expression with go-latex's engine (the same
// family of MathJax/KaTeX-style layout used by Typora), then inverts it for
// the dark theme. A cache keeps a formula from being re-rasterised each frame.
func mathBitmap(expr string, size float64, dark bool) *ui.Bitmap {
	key := fmt.Sprintf("%s|%.1f|%v", expr, size, dark)
	if v, ok := mathCache.Load(key); ok {
		return v.(*mathRender).bmp
	}
	mathMu.Lock()
	defer mathMu.Unlock()
	if v, ok := mathCache.Load(key); ok {
		return v.(*mathRender).bmp
	}
	var img image.Image
	var err error
	if m, ok := parseMatrix(expr); ok {
		img, err = m.render(size)
	} else {
		img, err = renderMathImage(expr, size)
	}
	var bmp *ui.Bitmap
	if err == nil {
		if dark {
			img = invertImage(img)
		}
		bmp = ui.NewBitmap(img)
	}
	mathCache.Store(key, &mathRender{bmp: bmp})
	return bmp
}

func renderMathImage(expr string, size float64) (img image.Image, err error) {
	expr = normalizeTeX(expr)
	img, err = renderMathImageRaw(expr, size)
	if err == nil {
		return img, nil
	}
	if strings.ContainsAny(expr, "^_") {
		if script, serr := renderScriptImage(expr, size); serr == nil {
			return script, nil
		}
	}
	return nil, err
}

func renderMathImageRaw(expr string, size float64) (img image.Image, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("math panic: %v", r)
		}
	}()
	var buf bytes.Buffer
	if err := mtex.Render(drawimg.NewRenderer(&buf), "$"+expr+"$", size, mathDPI, nil); err != nil {
		return nil, err
	}
	return png.Decode(bytes.NewReader(buf.Bytes()))
}

func invertImage(src image.Image) image.Image {
	b := src.Bounds()
	dst := image.NewRGBA(b)
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			r, g, bl, a := src.At(x, y).RGBA()
			if a == 0 {
				continue
			}
			dst.Set(x, y, color.RGBA{
				R: 255 - uint8(r>>8),
				G: 255 - uint8(g>>8),
				B: 255 - uint8(bl>>8),
				A: uint8(a >> 8),
			})
		}
	}
	return dst
}

// drawMathBlock shows the typeset formula, capped to the content width. The
// Unicode fallback in renderBlock is used if the expression cannot be
// typeset.
func drawMathBlock(c *ui.Context, bmp *ui.Bitmap, s rstyle) {
	w, h := bmp.Size()
	fw := float32(w) * 72 / mathDPI * 1.4
	fh := float32(h) * 72 / mathDPI * 1.4
	maxW := float32(800)
	if s.o.ContentWidth > 0 {
		maxW = s.o.ContentWidth
	}
	if fw > maxW {
		fh = fh * maxW / fw
		fw = maxW
	}
	ui.Row(c).FillWidth().Justify(ui.Center).Padding(8, 0).Children(func() {
		ui.Image(c, bmp).Size(fw, fh)
	})
}

// RenderMath exposes the cached math raster to the native editor.
func RenderMath(expr string, size float64, dark bool) *ui.Bitmap {
	return mathBitmap(expr, size, dark)
}
