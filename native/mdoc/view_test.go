package mdoc

import (
	"testing"

	"github.com/egoist/mygo/ui"
)

// View draws a document with the ui package alone; the headless Tester
// proves the native renderer shows every block without a window.
func TestViewRendersDocument(t *testing.T) {
	d := Parse("# Title\n\nHello **world**.\n\n- alpha\n- beta\n\n> quoted line\n\n```go\nfmt.Println(1)\n```\n")
	tt := ui.NewTester(func(c *ui.Context) { View(c, d, Options{}) }, 640, 480)

	for _, want := range []string{"Title", "world", "alpha", "beta", "quoted line", "fmt.Println(1)"} {
		if !tt.HasText(want) {
			t.Errorf("view does not show %q; texts = %v", want, tt.Texts())
		}
	}
}

func TestViewHandlesNilDocument(t *testing.T) {
	tt := ui.NewTester(func(c *ui.Context) { View(c, nil, Options{}) }, 320, 200)
	if len(tt.Texts()) != 0 {
		t.Errorf("nil document drew %v, want nothing", tt.Texts())
	}
}