// Muse · MyGo 版入口。对应 Electron 版 electron/main.ts：
// 窗口、应用菜单（含快捷键）、生命周期、外部「打开方式」。
//
// 开发：
//
//	pnpm dev:web              # 另开终端，vite dev server :5173
//	MYGO_DEV_URL=http://localhost:5173 go run ./muse-go
//
// 生产（前端先构建进 muse-go/frontend/dist，由 go:embed 内嵌）：
//
//	pnpm build:web && go build -o Muse ./muse-go
package main

import (
	"embed"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/egoist/mygo"

	"muse/services"
)

//go:embed all:frontend/dist
var frontendDist embed.FS

var files *services.Files

func main() {
	app := mygo.App
	// 关键：先设置应用名——决定用户数据目录，macOS 菜单栏 / Dock 也用它
	app.SetName("Muse")

	dist, err := fs.Sub(frontendDist, "frontend/dist")
	if err != nil {
		log.Fatal(err)
	}
	mygo.SetFrontend(dist)

	files, err = services.NewFiles()
	if err != nil {
		log.Fatal(err)
	}
	mygo.Bind(files, services.NewAI(), &services.Export{}, &services.App{})

	// macOS：文件拖到 Dock 图标 / Finder「打开方式」。
	// 渲染进程未就绪时先暂存，经 app:get-open-paths 握手一次性派发。
	app.OnOpenFile(func(path string) {
		services.S.QueueOpenPath(path)
	})

	app.WhenReady(func() {
		openWindow()
		if os.Getenv("MUSE_DEBUG_MENU") == "1" {
			scheduleDebugMenuTrigger()
		}
	})
	// macOS 惯例：关窗不退出；其他平台关窗即退出
	app.OnWindowAllClosed(func() {
		if runtime.GOOS != "darwin" {
			app.Quit()
		}
	})
	app.OnActivate(func(hasVisibleWindows bool) {
		if !hasVisibleWindows {
			openWindow()
		}
	})
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}

func openWindow() {
	win := mygo.NewWindow(mygo.WindowOptions{
		Title:      "Muse",
		Width:      1200,
		Height:     800,
		MinWidth:   720,
		MinHeight:  480,
		BackgroundColor: "#ffffff",
		// 隐藏标题栏、红绿灯浮在内容上（落进左侧文件栏顶部的拖拽条）
		TitleBarStyle:  mygo.TitleBarHidden,
		TitleBarHeight: 52,
		URL:             "/",
	})
	services.S.Win = win

	buildMenu(win)
	services.RebuildMenu = func() { buildMenu(win) }

	// 关闭：脏则拦截，交渲染进程确认；强制关闭（确认后）放行
	win.OnClose(func(e *mygo.CloseEvent) {
		force, dirty := services.S.CloseDecision()
		if force {
			return
		}
		if dirty {
			e.PreventDefault()
			_ = services.EvRequestClose.Broadcast(nil)
		}
	})
}

// ---- 应用菜单（对齐 Typora / Electron 版 main.ts） ----

var (
	lastMenuMu     sync.Mutex
	lastMenuActionAt time.Time
	lastMenuAction   string
)

func send(win *mygo.Window, action string) {
	// 800ms 内同动作节流：防止快捷键重复派发导致连弹（弹窗类动作）
	lastMenuMu.Lock()
	now := time.Now()
	if action == lastMenuAction && now.Sub(lastMenuActionAt) < 800*time.Millisecond {
		lastMenuMu.Unlock()
		return
	}
	lastMenuAction = action
	lastMenuActionAt = now
	lastMenuMu.Unlock()
	log.Printf("[muse] menu action: %s", action)
	_ = services.EvMenuAction.Broadcast(services.MenuPayload{Action: action})
}

// 格式化动作不节流：连按 ⌘B 切换加粗是正常操作
func sendFormat(format string) {
	log.Printf("[muse] menu format: %s", format)
	_ = services.EvMenuAction.Broadcast(services.MenuPayload{Action: "format", Format: format})
}

func buildMenu(win *mygo.Window) {
	recent := files.Recent()
	var recentSub []*mygo.MenuItem
	if len(recent) > 0 {
		for _, p := range recent {
			path := p
			recentSub = append(recentSub, &mygo.MenuItem{
				Label: filepath.Base(p),
				Click: func(*mygo.MenuItem, *mygo.Window) {
					_ = services.EvMenuAction.Broadcast(services.MenuPayload{Action: "open-recent", Path: path})
				},
			})
		}
	} else {
		recentSub = append(recentSub, &mygo.MenuItem{Label: "无最近文件", Disabled: true})
	}
	log.Printf("[muse] menu built: %d recent", len(recent))

	sendFn := func(action string) func(*mygo.MenuItem, *mygo.Window) {
		return func(*mygo.MenuItem, *mygo.Window) { send(win, action) }
	}
	formatFn := func(format string) func(*mygo.MenuItem, *mygo.Window) {
		return func(*mygo.MenuItem, *mygo.Window) { sendFormat(format) }
	}

	// 段落菜单（Typora：⌘1-6 标题、⌘0 正文、⌘⌥ 组合插入块级结构）
	paragraphMenu := &mygo.MenuItem{
		Label: "段落",
		Submenu: []*mygo.MenuItem{
			{Label: "一级标题", Accelerator: "CmdOrCtrl+1", Click: formatFn("heading-1")},
			{Label: "二级标题", Accelerator: "CmdOrCtrl+2", Click: formatFn("heading-2")},
			{Label: "三级标题", Accelerator: "CmdOrCtrl+3", Click: formatFn("heading-3")},
			{Label: "四级标题", Accelerator: "CmdOrCtrl+4", Click: formatFn("heading-4")},
			{Label: "五级标题", Accelerator: "CmdOrCtrl+5", Click: formatFn("heading-5")},
			{Label: "六级标题", Accelerator: "CmdOrCtrl+6", Click: formatFn("heading-6")},
			{Label: "正文", Accelerator: "CmdOrCtrl+0", Click: formatFn("paragraph")},
			mygo.Separator(),
			{Label: "提升标题等级", Accelerator: "CmdOrCtrl+=", Click: formatFn("increase-heading")},
			{Label: "降低标题等级", Accelerator: "CmdOrCtrl+-", Click: formatFn("decrease-heading")},
			mygo.Separator(),
			{Label: "引用", Accelerator: "Alt+CmdOrCtrl+Q", Click: formatFn("quote")},
			{Label: "无序列表", Accelerator: "Alt+CmdOrCtrl+U", Click: formatFn("bullet-list")},
			{Label: "有序列表", Accelerator: "Alt+CmdOrCtrl+O", Click: formatFn("ordered-list")},
			{Label: "任务列表", Accelerator: "Shift+CmdOrCtrl+X", Click: formatFn("task-list")},
			{Label: "增加缩进", Accelerator: "CmdOrCtrl+]", Click: formatFn("sink-list")},
			{Label: "减少缩进", Accelerator: "CmdOrCtrl+[", Click: formatFn("lift-list")},
			mygo.Separator(),
			{Label: "代码块", Accelerator: "Alt+CmdOrCtrl+C", Click: formatFn("code-fence")},
			{Label: "数学块", Accelerator: "Alt+CmdOrCtrl+B", Click: formatFn("math-block")},
			{Label: "表格", Accelerator: "Alt+CmdOrCtrl+T", Click: formatFn("table")},
			{Label: "分隔线", Accelerator: "Shift+CmdOrCtrl+-", Click: formatFn("hr")},
		},
	}

	// 格式菜单（行内样式，Typora：⌘B/⌘I/⌘K…）
	formatMenu := &mygo.MenuItem{
		Label: "格式",
		Submenu: []*mygo.MenuItem{
			{Label: "加粗", Accelerator: "CmdOrCtrl+B", Click: formatFn("bold")},
			{Label: "斜体", Accelerator: "CmdOrCtrl+I", Click: formatFn("italic")},
			{Label: "删除线", Accelerator: "Ctrl+Shift+`", Click: formatFn("strike")},
			{Label: "行内代码", Accelerator: "Shift+CmdOrCtrl+`", Click: formatFn("inline-code")},
			mygo.Separator(),
			{Label: "链接…", Accelerator: "CmdOrCtrl+K", Click: sendFn("link")},
			{Label: "图片…", Accelerator: "Ctrl+CmdOrCtrl+I", Click: sendFn("insert-image")},
			mygo.Separator(),
			{Label: "清除格式", Accelerator: "CmdOrCtrl+\\", Click: formatFn("clear-format")},
		},
	}

	// 视图菜单：源代码 / 专注 / 打字机 / 侧栏 / 大纲 / 全屏
	viewMenu := &mygo.MenuItem{
		Label: "视图",
		Submenu: []*mygo.MenuItem{
			{Label: "源代码模式", Accelerator: "CmdOrCtrl+/", Click: sendFn("source-mode")},
			mygo.Separator(),
			{Label: "专注模式", Accelerator: "F8", Click: sendFn("focus-mode")},
			{Label: "打字机模式", Accelerator: "F9", Click: sendFn("typewriter-mode")},
			mygo.Separator(),
			{Label: "文件侧栏", Accelerator: "Shift+CmdOrCtrl+L", Click: sendFn("toggle-files")},
			{Label: "大纲", Accelerator: "Ctrl+CmdOrCtrl+1", Click: sendFn("toggle-outline")},
			mygo.Separator(),
			{Label: "重新加载", Accelerator: "CmdOrCtrl+R", Click: func(*mygo.MenuItem, *mygo.Window) { win.Reload() }},
			{Role: mygo.RoleToggleFullScreen, Label: "全屏"},
		},
	}

	mygo.App.SetMenu(mygo.NewMenu([]*mygo.MenuItem{
		{Role: mygo.RoleAppMenu},
		{
			Label: "文件",
			Submenu: []*mygo.MenuItem{
				{Label: "新建", Accelerator: "CmdOrCtrl+N", Click: sendFn("new")},
				{Label: "打开…", Accelerator: "CmdOrCtrl+O", Click: sendFn("open")},
				{Label: "打开文件夹…", Accelerator: "Shift+CmdOrCtrl+O", Click: sendFn("open-folder")},
				mygo.Separator(),
				{Label: "最近打开", Submenu: recentSub},
				mygo.Separator(),
				{Label: "保存", Accelerator: "CmdOrCtrl+S", Click: sendFn("save")},
				{Label: "另存为…", Accelerator: "CmdOrCtrl+Shift+S", Click: sendFn("saveAs")},
				mygo.Separator(),
				{
					Label: "导出",
					Submenu: []*mygo.MenuItem{
						{Label: "PDF…", Click: sendFn("export-pdf")},
						{Label: "HTML…", Click: sendFn("export-html")},
					},
				},
				mygo.Separator(),
				{Role: mygo.RoleClose},
			},
		},
		{
			Label: "编辑",
			Submenu: []*mygo.MenuItem{
				{Role: mygo.RoleUndo},
				{Role: mygo.RoleRedo},
				mygo.Separator(),
				{Role: mygo.RoleCut},
				{Role: mygo.RoleCopy},
				{Role: mygo.RolePaste},
				mygo.Separator(),
				{Label: "查找…", Accelerator: "CmdOrCtrl+F", Click: sendFn("find")},
				mygo.Separator(),
				{Role: mygo.RoleSelectAll},
			},
		},
		paragraphMenu,
		formatMenu,
		viewMenu,
		{Role: mygo.RoleWindowMenu},
	}))
}
