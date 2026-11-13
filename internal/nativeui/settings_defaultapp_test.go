package nativeui

import (
	"errors"
	"testing"

	"github.com/egoist/mygo/ui"
)

// TestSettingMuseAsDefaultReportsImmediateFailure 请求根本没送到系统时（比如
// 框架加载失败），不能停在「等待系统确认」上，也不能让按钮点了像没反应。
func TestSettingMuseAsDefaultReportsImmediateFailure(t *testing.T) {
	a := New()
	a.markdownDefaultApp = "/Applications/Muse.app"
	a.markdownDefaultRequest = func(string, func(error)) error {
		return errors.New("没有可交给系统的应用包")
	}
	a.openSettings()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()

	if err := tt.Click("设为默认"); err != nil {
		t.Fatalf("click set-as-default: %v", err)
	}
	tt.Frame()

	if !tt.HasText("没有改成") {
		t.Fatalf("the row does not report a request that never reached the system; texts = %q", tt.Texts())
	}
	if tt.HasText("等待系统确认") {
		t.Fatalf("the row waits for a completion that will never come; texts = %q", tt.Texts())
	}
	if err := tt.Click("设为默认"); err != nil {
		t.Fatalf("the row offers no retry after an immediate failure: %v", err)
	}
}
