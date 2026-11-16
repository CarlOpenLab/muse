package nativeui

import (
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"

	"muse/internal/services"
)

// updateController is the slice of the updater the settings page uses.
// Keeping it behind an interface lets the page's tests record what it asks
// for without registering the updater plugin (which panics until mygo.Use
// has run) or touching the network.
type updateController interface {
	Preferences() services.UpdatePreferences
	SetAutomaticChecks(bool)
	SetAutomaticDownloads(bool)
	Check()
}

// liveUpdates is the controller once the updater plugin is registered: the
// page's preferences and actions go through the services bridge, which reads
// the plugin's state and asks it to check.
type liveUpdates struct{ svc services.App }

func (u liveUpdates) Preferences() services.UpdatePreferences { return u.svc.UpdatePreferences() }
func (u liveUpdates) SetAutomaticChecks(on bool)              { u.svc.SetAutomaticChecks(on) }
func (u liveUpdates) SetAutomaticDownloads(on bool)           { u.svc.SetAutomaticDownloads(on) }
func (u liveUpdates) Check()                                  { u.svc.CheckForUpdates() }

// unavailableUpdates stands in before the plugin is registered, and in
// headless tests. It reports the running version but offers no checks.
type unavailableUpdates struct{}

func (unavailableUpdates) Preferences() services.UpdatePreferences {
	return services.UpdatePreferences{
		Version:         mygo.App.Version(),
		Enabled:         false,
		AutomaticChecks: true,
	}
}

func (unavailableUpdates) SetAutomaticChecks(bool)    {}
func (unavailableUpdates) SetAutomaticDownloads(bool) {}
func (unavailableUpdates) Check()                     {}

// updateSettings is the settings page's 应用更新 tab: the running version,
// when it last checked, a button to check now, and the two automatic
// preferences. The switches read the preference into a local each frame, so
// the next frame shows whatever the updater stored.
func (a *App) updateSettings(c *ui.Context) {
	t := c.Theme()
	prefs := a.updates.Preferences()

	settingsGroup(c, "", func() {
		a.settingsDivider(c, false)
		settingsRow(c, "Muse "+prefs.Version, "上次检查："+formatLastCheck(prefs.LastCheck), func() {
			if ui.Button(c, "检查更新").Clicked() {
				a.updates.Check()
			}
		})
		a.settingsDivider(c, true)
		autoChecks := prefs.AutomaticChecks
		settingsRow(c, "自动检查更新", "每天在后台检查一次，有新版时提醒。", func() {
			if ui.Switch(c, &autoChecks).Label("允许自动检查").Changed() {
				a.updates.SetAutomaticChecks(autoChecks)
				a.invalidate()
			}
		})
		a.settingsDivider(c, true)
		autoDownloads := prefs.AutomaticDownloads
		settingsRow(c, "自动下载并安装", "发现新版后自动安装，下次启动生效，不中断当前写作。", func() {
			if ui.Switch(c, &autoDownloads).Label("允许自动下载").Changed() {
				a.updates.SetAutomaticDownloads(autoDownloads)
				a.invalidate()
			}
		})
	})
	if !prefs.Enabled {
		ui.Text(c, "当前运行位置无法自动安装更新。开发模式或只读位置无法自更新。macOS 请先把 Muse 拖入 Applications 后运行；其他平台请放在有写入权限的目录。").
			FontSize(11.5).TextColor(t.TextMuted).Wrap().Padding(0, 4)
	}
	ui.Text(c, "更新来自 CarlOpenLab/muse 的 GitHub Releases，安装前验证发布签名。重启前仍会检查未保存的文档。").
		FontSize(11.5).TextColor(t.TextMuted).Wrap().Padding(0, 4)
}

// formatLastCheck turns the stored RFC3339 timestamp into the local
// wall-clock time the settings page shows. An empty value means no check has
// finished yet; an unparsable one is shown as-is rather than hidden.
func formatLastCheck(s string) string {
	if s == "" {
		return "尚未检查"
	}
	last, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return s
	}
	return last.Local().Format("2006-01-02 15:04")
}
