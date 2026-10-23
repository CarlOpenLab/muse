package nativeui

import (
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestSettingsDialog(t *testing.T) {
	a := New()
	a.openSettings()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	for _, want := range []string{"设置", "主题", "排版", "浅色", "深色"} {
		if !tt.HasText(want) {
			t.Fatalf("missing %q; texts = %q", want, tt.Texts())
		}
	}
	if err := tt.Click("排版"); err != nil {
		t.Fatalf("open typography: %v", err)
	}
	tt.Frame()
	if !tt.HasText("字号") || !tt.HasText("行高") {
		t.Fatalf("typography page missing; texts = %q", tt.Texts())
	}
	if err := tt.Click("主题"); err != nil {
		t.Fatalf("back to theme: %v", err)
	}
	tt.Frame()
	if err := tt.Click("深色"); err != nil {
		t.Fatalf("switch theme: %v", err)
	}
	if a.themeMode != 1 {
		t.Fatalf("themeMode = %d, want 1", a.themeMode)
	}
}
