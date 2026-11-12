package mdoc

import (
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestInlineMathLayout(t *testing.T) {
	d := Parse("质能方程 $E=mc^2$，分式 $\\frac{a}{b}$，以及 $\\sqrt{x+1}$。\n")
	tt := ui.NewTester(func(c *ui.Context) { View(c, d, Options{ContentWidth: 420}) }, 800, 400)
	tt.Frame()
	if !tt.HasText("质能方程") || !tt.HasText("以及") {
		t.Fatalf("text around math missing: %q", tt.Texts())
	}
}
