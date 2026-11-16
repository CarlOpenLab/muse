package nativeui

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"muse/internal/services"
)

// fakeUpdates is the settings page's view of the updater: it records what
// the page asks for without starting the plugin or touching the network.
type fakeUpdates struct {
	prefs         services.UpdatePreferences
	checks        int
	autoChecks    []bool
	autoDownloads []bool
}

func (f *fakeUpdates) Preferences() services.UpdatePreferences { return f.prefs }

func (f *fakeUpdates) SetAutomaticChecks(on bool) {
	f.prefs.AutomaticChecks = on
	f.autoChecks = append(f.autoChecks, on)
}

func (f *fakeUpdates) SetAutomaticDownloads(on bool) {
	f.prefs.AutomaticDownloads = on
	f.autoDownloads = append(f.autoDownloads, on)
}

func (f *fakeUpdates) Check() { f.checks++ }

func newUpdateTestApp(t *testing.T) (*App, *fakeUpdates) {
	t.Helper()
	a := New()
	now := time.Now().Truncate(time.Minute)
	fake := &fakeUpdates{prefs: services.UpdatePreferences{
		Version:            "0.6.0",
		Enabled:            true,
		AutomaticChecks:    true,
		AutomaticDownloads: false,
		LastCheck:          now.Format(time.RFC3339),
	}}
	a.updates = fake
	a.openSettings()
	return a, fake
}

// TestUpdateSettingsPageShowsVersionAndControls 设置里的「应用更新」页要真的
// 摆出版本、上次检查、检查按钮和两个开关；少了任何一项，更新就只能从
// 菜单里点，偏好也改不了。
func TestUpdateSettingsPageShowsVersionAndControls(t *testing.T) {
	a, _ := newUpdateTestApp(t)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if err := tt.Click("应用更新"); err != nil {
		t.Fatalf("open update settings: %v", err)
	}
	tt.Frame()
	want := "上次检查：" + time.Now().Truncate(time.Minute).Local().Format("2006-01-02 15:04")
	for _, text := range []string{"Muse 0.6.0", want, "检查更新", "自动检查更新", "自动下载并安装"} {
		if !tt.HasText(text) {
			t.Fatalf("missing %q; texts = %q", text, tt.Texts())
		}
	}
}

func TestUpdateTogglesCallTheController(t *testing.T) {
	a, fake := newUpdateTestApp(t)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if err := tt.Click("应用更新"); err != nil {
		t.Fatalf("open update settings: %v", err)
	}
	tt.Frame()

	if err := tt.Click("允许自动检查"); err != nil {
		t.Fatalf("toggle automatic checks: %v", err)
	}
	tt.Frame()
	if len(fake.autoChecks) != 1 || fake.autoChecks[0] != false {
		t.Fatalf("automatic checks = %v, want one false", fake.autoChecks)
	}

	if err := tt.Click("允许自动下载"); err != nil {
		t.Fatalf("toggle automatic downloads: %v", err)
	}
	tt.Frame()
	if len(fake.autoDownloads) != 1 || fake.autoDownloads[0] != true {
		t.Fatalf("automatic downloads = %v, want one true", fake.autoDownloads)
	}
}

func TestCheckForUpdatesButton(t *testing.T) {
	a, fake := newUpdateTestApp(t)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if err := tt.Click("应用更新"); err != nil {
		t.Fatalf("open update settings: %v", err)
	}
	tt.Frame()
	if err := tt.Click("检查更新"); err != nil {
		t.Fatalf("check for updates: %v", err)
	}
	tt.Frame()
	if fake.checks != 1 {
		t.Fatalf("checks = %d, want 1", fake.checks)
	}
}

// TestUpdateSettingsExplainsWhenDisabled 开发构建或只读位置不能自更新时，
// 页面要说清楚为什么，而不是让按钮点了没反应。
func TestUpdateSettingsExplainsWhenDisabled(t *testing.T) {
	a, fake := newUpdateTestApp(t)
	fake.prefs.Enabled = false
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if err := tt.Click("应用更新"); err != nil {
		t.Fatalf("open update settings: %v", err)
	}
	tt.Frame()
	if !tt.HasText("当前运行位置无法自动安装更新") {
		t.Fatalf("missing the disabled-location note; texts = %q", tt.Texts())
	}
}

func TestFormatLastCheck(t *testing.T) {
	if got := formatLastCheck(""); got != "尚未检查" {
		t.Fatalf("empty last check = %q", got)
	}
	now := time.Now().Truncate(time.Minute)
	if got, want := formatLastCheck(now.Format(time.RFC3339)), now.Local().Format("2006-01-02 15:04"); got != want {
		t.Fatalf("last check = %q, want %q", got, want)
	}
	if got := formatLastCheck("not a time"); got != "not a time" {
		t.Fatalf("invalid last check = %q", got)
	}
}
