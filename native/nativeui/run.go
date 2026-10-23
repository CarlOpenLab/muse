package nativeui

import (
	"log"
	"os"
	"runtime"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

// Run opens the native Muse window and runs the app loop. It is called by the
// native entry point; nothing in this package needs a webview or a frontend
// build.
func Run() {
	app := New()
	mygo.App.SetName("Muse")
	mygo.App.WhenReady(func() {
		switch os.Getenv("MUSE_THEME") {
		case "light":
			app.themeMode = 0
		case "dark":
			app.themeMode = 1
		default:
			if mygo.Theme.IsDark() {
				app.themeMode = 1
			}
		}
		if ws := os.Getenv("MUSE_WORKSPACE"); ws != "" {
			app.setWorkspace(ws)
		}
		if p := os.Getenv("MUSE_OPEN"); p != "" {
			app.openPathNow(p)
		}
		if os.Getenv("MUSE_SETTINGS") == "1" {
			app.settingsOpen = true
		}
		app.openWindow()
	})
	mygo.App.OnActivate(func(hasVisibleWindows bool) {
		if !hasVisibleWindows {
			app.openWindow()
		}
	})
	// macOS keeps the app alive after its window closes, as every Mac app does.
	mygo.App.OnWindowAllClosed(func() {
		if runtime.GOOS != "darwin" {
			mygo.App.Quit()
		}
	})
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}

func (a *App) openWindow() {
	if a.win != nil && !a.win.IsDestroyed() {
		a.win.Show()
		a.win.Focus()
		return
	}
	a.win = mygo.NewWindow(mygo.WindowOptions{
		Title:           "Muse",
		Width:           1200,
		Height:          800,
		MinWidth:        720,
		MinHeight:       480,
		BackgroundColor: "light-dark(#f5f5f5, #1a1a1a)",
		StateKey:        "muse-native",
		Content:         ui.View(a.View),
		// The rail's first 44px hold the traffic lights; the rest of the
		// view starts beside them, as the web app did.
		TitleBarStyle:        mygo.TitleBarHidden,
		TitleBarHeight:       44,
		TrafficLightPosition: &mygo.Point{X: 12, Y: 15},
	})
	a.installMenu()
	a.updateTitle()
	a.win.OnClose(func(e *mygo.CloseEvent) {
		if !a.dirty {
			return
		}
		e.PreventDefault()
		if a.closing || a.busy {
			return
		}
		a.closing = true
		a.startBusy()
		// Message dialogs block on the main loop; ask from a goroutine and
		// hop back only to close the window.
		go func() {
			ok := a.confirmDiscardOffUI()
			mygo.RunOnMain(func() {
				a.closing = false
				a.busy = false
				if ok {
					a.win.Close()
					return
				}
				a.win.Invalidate()
			})
		}()
	})

	// MUSE_CAPTURE=/path.png renders the native window once and exits: the
	// same tool mdshot gave the webview, now without a webview.
	a.win.Show()
	a.win.Focus()
	mygo.App.Focus()

	if path := os.Getenv("MUSE_CAPTURE"); path != "" {
		go func() {
			time.Sleep(1200 * time.Millisecond)
			if png, err := a.win.CapturePage(); err == nil {
				_ = os.WriteFile(path, png, 0o644)
			}
			mygo.App.Exit(0)
		}()
	}
}

func (a *App) installMenu() {
	if a.win == nil {
		return
	}
	w := a.win
	click := func(fn func()) func(*mygo.MenuItem, *mygo.Window) {
		return func(*mygo.MenuItem, *mygo.Window) {
			fn()
			w.Invalidate()
		}
	}
	mygo.App.SetMenu(mygo.NewMenu([]*mygo.MenuItem{
		{Role: mygo.RoleAppMenu},
		{
			Label: "文件",
			Submenu: []*mygo.MenuItem{
				{Label: "新建", Accelerator: "CmdOrCtrl+N", Click: click(a.newDoc)},
				{Label: "打开…", Accelerator: "CmdOrCtrl+O", Click: click(a.openFileDialog)},
				{Label: "打开文件夹…", Accelerator: "Shift+CmdOrCtrl+O", Click: click(a.openFolderDialog)},
				mygo.Separator(),
				{Label: "保存", Accelerator: "CmdOrCtrl+S", Click: click(a.save)},
				{Label: "另存为…", Accelerator: "Shift+CmdOrCtrl+S", Click: click(a.saveAs)},
				mygo.Separator(),
				{Role: mygo.RoleClose},
			},
		},
		{Role: mygo.RoleEditMenu},
		{
			Label: "视图",
			Submenu: []*mygo.MenuItem{
				{Label: "文件栏", Accelerator: "Shift+CmdOrCtrl+L", Click: click(func() { a.togglePanel(panelFiles) })},
				{Label: "大纲", Click: click(func() { a.togglePanel(panelOutline) })},
				{Label: "搜索", Accelerator: "CmdOrCtrl+F", Click: click(func() { a.togglePanel(panelSearch) })},
				{Label: "AI 助手", Click: click(func() { a.togglePanel(panelAI) })},
				mygo.Separator(),
				{Label: "切换主题", Accelerator: "CmdOrCtrl+Shift+T", Click: click(func() { a.themeMode = 1 - a.themeMode })},
				mygo.Separator(),
				{Label: "设置…", Accelerator: "CmdOrCtrl+,", Click: click(a.openSettings)},
			},
		},
		{Role: mygo.RoleWindowMenu},
	}))
}
