// Package nativeui is Muse's fully native shell: MyGo draws the window, the
// icon rail, the context panel and the Markdown editor with no webview and no
// frontend build.
//
// The first milestone keeps the current layout and the parts a writer needs
// every day: a 56px icon rail, one shared context panel (files / outline /
// search / AI), and a Markdown editor that renders with mdoc and edits the
// source in mygo's native text area.
package nativeui

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"

	"muse/mdoc"
	"muse/services"
)

const (
	railWidth      float32 = 56
	railButtonSize float32 = 34
	// railInset centres the 34px buttons in the 56px rail instead of letting
	// them hug the window edge: (56-34)/2 = 11px on each side.
	railInset = (railWidth - railButtonSize) / 2
)

// panelView is the page the context panel shows.
type panelView int

const (
	panelFiles panelView = iota
	panelOutline
	panelAI
	panelSearch
)

// heading is one entry of the document outline.
type heading struct {
	level int
	text  string
	block int // index into App.blocks, so an outline click can scroll to it
}

// clipboardWrite is a seam for tests: the real clipboard waits on the app's
// main loop, which a headless test does not run.
var clipboardWrite = mygo.Clipboard.WriteText

// Dialog seams keep the blocking desktop APIs testable and document that
// every call runs off the UI thread.
var (
	openDialog    = mygo.Dialog.Open
	saveDialog    = mygo.Dialog.Save
	messageDialog = mygo.Dialog.Message
	errorDialog   = mygo.Dialog.Error
	trashItem     = mygo.Shell.TrashItem
)

// App is the window's state: everything the view reads and the actions write.
type App struct {
	win *mygo.Window

	// WebView canvas (webeditor.go): nil when the canvas is unavailable and
	// the all-native editor runs instead.
	webView       *mygo.WebView
	webReady      bool
	webPushRev    int
	saveReply     chan string
	saveMu        sync.Mutex
	folderToggled map[string]time.Time

	// quick open (⌘O): fuzzy file jump inside the workspace
	quickOpen      bool
	quickOpenValue string
	quickOpenSel   int

	// command palette (⌘P): searchable menu actions
	cmdPalette bool
	cmdValue   string
	cmdSel     int
	webSel     struct {
		from, to int
		text     string
	}

	// appearance
	themeMode int  // 0 pure white, 1 near black
	dark      bool // derived from themeMode for the view

	// context panel
	panel      panelView
	panelOpen  bool
	panelWidth float32
	// panelW is the animated width the last frame drew, 0 when collapsed.
	// The canvas and the caret mapping read it instead of panelOpen so they
	// move with the slide instead of jumping at the ends.
	panelW float32
	// panelPrevTarget 是上一帧的宽度目标，用来识别「开着切换模块」。
	panelPrevTarget float32

	// workspace
	root         string
	dirs         map[string][]string
	isDir        map[string]bool
	expanded     map[string]bool
	fileList     ui.ListState
	selectedPath string

	// document
	path     string
	source   string
	doc      *mdoc.Doc
	headings []heading
	dirty    bool

	// block editing: the chunk shown as an input, and its range in source
	blocks       []sourceBlock
	editing      int
	editSource   string
	editStart    int
	editEnd      int
	editOriginal string
	editWasFocus bool

	// where the click landed, so the caret starts there instead of at the end
	editClickX      float32
	editClickY      float32
	editPlaceCaret  bool
	editBefore      string
	editPasted      bool
	editCaretSet    bool
	editCaretTarget int
	editAutoFocus   bool
	editAffixPrefix string
	editAffixSuffix string
	editSelStart    int
	editSelEnd      int
	editSelectEnd   int
	editHandle      *ui.Handle

	// the paragraph/heading being edited as rich text
	rich *richEditor

	// the image block being edited with alt/src fields
	imageEdit *imageEditor

	// the table cell being edited inline, if any
	cellEdit *cellEditor

	// settings
	settingsOpen bool
	settingsTab  int
	settingsDrag ui.Point
	fontSize     float64
	lineHeight   float64

	// AI
	ai          aiSettings
	aiClient    *services.AI
	aiMessages  []chatMessage
	aiInput     string
	aiBusy      bool
	aiPhase     string // 流式进行中的一句话状态，如「深度思考中…」
	aiRequestID string
	aiErr       string
	aiScroll    ui.ScrollState
	aiStop      atomic.Bool
	// aiToolsUnsupported 由 Agent 循环置位：端点不支持 function
	// calling 时整个会话退回纯对话，只在循环 goroutine 上读写。
	aiToolsUnsupported bool
	// aiApprovals 是等待用户确认的工具调用（主线程读写）：调用 ID →
	// 决定通道，审批卡按钮经 decideApproval 递结果。
	aiApprovals map[string]chan approvalDecision
	// aiPerm 是修改类工具的权限预设（每次询问/完全访问/只读），
	// 会话内有效；审批卡上的「总是允许」会把它切到完全访问。
	aiPerm       aiPerm
	aiModels     []services.ProviderModel
	aiModelsBusy bool
	aiModelsErr  string

	// search: one hit per block, and the row chosen
	query       string
	matches     int
	searchHits  []searchHit
	searchState ui.ListState
	searchRow   int

	// outline rows
	outlineState ui.ListState
	outlineRow   int
	scrollTarget int

	// status line
	status   string
	statusAt time.Time

	// blocking dialog guard: one native dialog at a time, never on the UI thread
	busy    bool
	closing bool

	// inline rename dialog
	renameOpen  bool
	renamePath  string
	renameValue string

	// link URL popover (rich editor, Cmd+K on a link)
	linkPopOpen  bool
	linkPopURL   string
	linkPopLabel string
	linkPopRun   int // index into a.rich.runs
}

// New returns the app on an empty untitled document, with the panel on files.
func New() *App {
	a := &App{
		panel:        panelFiles,
		panelOpen:    true,
		panelWidth:   268,
		panelW:       268,
		dirs:         map[string][]string{},
		isDir:        map[string]bool{},
		expanded:     map[string]bool{},
		outlineRow:   -1,
		scrollTarget: -1,
		editing:      -1,
		fontSize:     16,
		lineHeight:   1.75,
		ai:           loadAISettings(),
		aiClient:     services.NewAI(),
		aiMessages:   loadAIChat(),
	}
	// 新窗口就是一张空白未命名文档（WebView 里显示双槽占位，原生回退显示空态按钮）。
	a.source = ""
	a.refreshDoc()
	return a
}

// ---------------------------------------------------------------------------
// View

func (a *App) View(c *ui.Context) {
	a.applyTheme(c)
	ui.Row(c).Fill().Background(a.windowBG()).Children(func() {
		a.rail(c)
		a.contextPanel(c)
		a.canvas(c)
	})

	a.settingsDialog(c)
	a.renameDialog(c)
	a.linkPopover(c)
	a.quickOpenDialog(c)
	a.commandPaletteDialog(c)
}

// windowBG is a single flat color, not a wash: the light side is a neutral
// canvas with a white editor card, the dark side a near-black canvas.
func (a *App) windowBG() ui.Color {
	if a.dark {
		return ui.Hex("#1a1a1a")
	}
	return ui.Hex("#f5f5f5")
}

func (a *App) applyTheme(c *ui.Context) {
	a.dark = a.themeMode == 1
	t := *c.Theme()
	if a.dark {
		t.Dark = true
		t.Background = ui.Hex("#232328")
		t.Surface = ui.Hex("#2a2a30")
		t.SurfaceHover = ui.RGBA(255, 255, 255, 0.07)
		t.SurfacePressed = ui.RGBA(255, 255, 255, 0.12)
		t.Border = ui.RGBA(255, 255, 255, 0.07)
		t.Text = ui.Hex("#ececf0")
		t.TextMuted = ui.Hex("#a9a9b4")
		t.Accent = ui.Hex("#6b93ff")
		t.AccentHover = ui.Hex("#7fa3ff")
		t.AccentPressed = ui.Hex("#5580f0")
		t.AccentText = ui.Hex("#101014")
		t.Selection = ui.RGBA(107, 147, 255, 0.28)
		t.Focus = ui.Hex("#6b93ff")
	} else {
		t.Dark = false
		t.Background = ui.Hex("#ffffff")
		t.Surface = ui.Hex("#f3f3f6")
		t.SurfaceHover = ui.RGBA(0, 0, 0, 0.045)
		t.SurfacePressed = ui.RGBA(0, 0, 0, 0.08)
		t.Border = ui.RGBA(0, 0, 0, 0.07)
		t.Text = ui.Hex("#1d1d1f")
		t.TextMuted = ui.Hex("#6e6e78")
		t.Accent = ui.Hex("#3b6cf6")
		t.AccentHover = ui.Hex("#4d7cf7")
		t.AccentPressed = ui.Hex("#2f5ce0")
		t.AccentText = ui.Hex("#ffffff")
		t.Selection = ui.RGBA(59, 108, 246, 0.25)
		t.Focus = ui.Hex("#3b6cf6")
	}
	t.Radius = 7
	t.FontSize = 13
	c.SetTheme(&t)
}

// canvas is the floating editor card: 8px away from the window's top, right
// and bottom, and 8px from the context panel. The rail and the panel paint
// nothing, so the window color shows behind them.
func (a *App) canvas(c *ui.Context) {
	t := c.Theme()
	ui.Row(c).Grow(1).FillHeight().MinWidth(0).Padding(8, 8, 8, a.canvasLeft(c)).Children(func() {
		card := ui.Column(c).Fill().Radius(14).Clip().Background(t.Background)
		if t.Dark {
			card.Border(1, ui.RGBA(236, 236, 240, 0.12)).
				Shadow(0, 1, 1, 0, ui.RGBA(0, 0, 0, 0.2)).
				Shadow(0, 4, 6, -3, ui.RGBA(0, 0, 0, 0.24))
		} else {
			card.Border(1, ui.RGBA(0, 0, 0, 0.06)).
				Shadow(0, 1, 2, 0, ui.RGBA(0, 0, 0, 0.07)).
				Shadow(0, 1, 6, 0, ui.RGBA(0, 0, 0, 0.035))
		}
		card.Children(func() {
			a.editorContent(c)
		})
	})
}

// rail is the 56px icon-only column. Its background is the window color; the active
// view is a raised card, as the demo's chosen sidebar row is.
func (a *App) rail(c *ui.Context) {
	bar := c.TitleBar()
	ui.Column(c).Width(railWidth).FillHeight().Padding(0, railInset).GapY(4).Children(func() {
		ui.Box(c).Height(bar.Height).DragWindow()
		// 最左侧只放模块切换；新建/打开都是文件模块的内容（面板顶部与菜单）。
		a.railButton(c, iconFiles, "文件", a.panelOpen && a.panel == panelFiles, func() {
			a.showPanel(panelFiles)
		})
		a.railButton(c, iconOutline, "大纲", a.panelOpen && a.panel == panelOutline, func() {
			a.showPanel(panelOutline)
		})
		a.railButton(c, iconSearch, "搜索", a.panelOpen && a.panel == panelSearch, func() {
			a.showPanel(panelSearch)
		})
		a.railButton(c, iconAI, "AI 助手", a.panelOpen && a.panel == panelAI, func() {
			a.showPanel(panelAI)
		})
		ui.Spacer(c)
		themeIcon := iconMoon
		themeLabel := "切换到深色"
		if a.dark {
			themeIcon = iconSun
			themeLabel = "切换到浅色"
		}
		a.railButton(c, themeIcon, themeLabel, false, func() { a.themeMode = 1 - a.themeMode; a.pushWebTheme() })
		a.railButton(c, iconSettings, "设置", a.settingsOpen, a.openSettings)
		ui.Box(c).Height(8)
	})
}

func (a *App) railButton(c *ui.Context, icon *ui.SVG, label string, active bool, fn func()) {
	t := c.Theme()
	b := ui.ButtonBase(c).Width(railButtonSize).Height(railButtonSize).Radius(8).Padding(0).
		Justify(ui.Center).AlignItems(ui.Center).Label(label).Description(label)
	switch {
	case active:
		if t.Dark {
			b.Background(ui.RGBA(255, 255, 255, 0.08))
		} else {
			b.Background(t.Background)
			b.Shadow(0, 0.5, 2, 0, ui.RGBA(0, 0, 0, 0.06))
		}
	case b.Hovered():
		b.Background(t.SurfaceHover)
	}
	b.OnClick(fn)
	b.Children(func() {
		el := ui.Icon(c, icon).Size(17, 17)
		if active {
			el.TextColor(t.Accent)
		} else {
			el.TextColor(t.TextMuted)
		}
	})
	a.railTooltip(c, b, label)
}

// railTooltip shows the label to the right of the rail, where it does not
// cover the context panel's header or the rail's own icons.
func (a *App) railTooltip(c *ui.Context, anchor ui.Element, label string) {
	t := c.Theme()
	fill, text := t.Inverse, t.InverseText
	if fill == ui.Transparent {
		fill = t.Text
	}
	if text == ui.Transparent {
		text = t.Background
	}
	ui.TooltipBase(c, anchor, func(tip ui.Element) {
		tip.MaxWidth(220).Padding(5, 8).Radius(6).Background(fill).TextColor(text).
			FontSize(t.FontSize - 1)
		tip.Shadow(0, 2, 8, 0, ui.RGBA(0, 0, 0, 0.2))
		tip.Children(func() { ui.Text(c, label) })
		tip.AttachTo(anchor, ui.AnchorRight, ui.AnchorLeft).Margin(0, 0, 0, 6)
	})
}

// ---------------------------------------------------------------------------
// Context panel

func (a *App) contextPanel(c *ui.Context) {
	target := float32(0)
	if a.panelOpen {
		target = a.panelWidth
	}
	// 打开状态下切换模块（或 AI 面板的加宽）时宽度一帧到位：滑到一半
	// 的窄面板会把头部按钮裁出可视区，正文也要跟着重排两次。仍要走
	// AnimateTo，动画通道得保持连续——跳过调用会让下一次开关从 0 起步。
	anim := ui.Animation{Duration: 180 * time.Millisecond, Ease: ui.EaseOut}
	if a.panelOpen && a.panelPrevTarget > 0.5 && a.panelPrevTarget != target {
		anim.Duration = time.Millisecond
	}
	a.panelPrevTarget = target
	// The panel is always built so its width can slide instead of vanishing
	// from one frame to the next. The content keeps the full panel width and
	// the outer box clips it, so text does not reflow on the way; it only
	// fades as the box closes.
	panel := ui.Column(c).Shrink(0).FillHeight().Clip()
	w := panel.AnimateTo("width", target, anim)
	a.panelW = w
	panel.Width(w)
	if w < 0.5 {
		return
	}
	openness := w / a.panelWidth
	if openness > 1 {
		openness = 1
	}
	panel.Children(func() {
		ui.Column(c).Width(a.panelWidth).FillHeight().Opacity(openness).Children(func() {
			a.panelHeader(c)
			switch a.panel {
			case panelFiles:
				a.filesView(c)
			case panelOutline:
				a.outlineView(c)
			case panelAI:
				a.aiView(c)
			case panelSearch:
				a.searchView(c)
			}
		})
	})
}

func (a *App) panelHeader(c *ui.Context) {
	bar := c.TitleBar()
	left := float32(12)
	if extra := bar.Left - railWidth + 8; extra > left {
		left = extra
	}
	ui.Row(c).Height(44).Shrink(0).Padding(0, 8, 0, left).Gap(4).DragWindow().
		AlignItems(ui.Center).Children(func() {
		ui.Text(c, a.panelTitle()).FontSize(12.5).FontWeight(600).Grow(1).SingleLine().Ellipsis("…")
		a.smallIcon(c, iconPanelLeftClose, "收起侧栏", a.collapsePanel)
	})
}

func (a *App) panelTitle() string {
	switch a.panel {
	case panelFiles:
		if a.root == "" {
			return "文件"
		}
		return filepath.Base(a.root)
	case panelOutline:
		return "大纲"
	case panelAI:
		return "AI 助手"
	default:
		return "查找"
	}
}

func (a *App) smallIcon(c *ui.Context, icon *ui.SVG, label string, fn func()) {
	t := c.Theme()
	b := ui.ButtonBase(c).Width(26).Height(26).Radius(6).Padding(0).
		Justify(ui.Center).AlignItems(ui.Center).Label(label).Tooltip(label)
	if b.Hovered() {
		b.Background(t.SurfaceHover)
	}
	b.OnClick(fn)
	b.Children(func() { ui.Icon(c, icon).Size(14, 14).TextColor(t.TextMuted) })
}

// filesView draws the workspace tree. Directories open lazily; the list builds
// only the rows in view, so a large repository is still quick.
func (a *App) filesView(c *ui.Context) {
	t := c.Theme()
	if a.root == "" {
		ui.Column(c).Fill().Center().Gap(10).Padding(20).Children(func() {
			ui.Icon(c, iconFolderOpen).Size(30, 30).TextColor(t.TextMuted)
			ui.Text(c, "打开文件或文件夹").FontSize(12.5).TextColor(t.TextMuted)
			// 一个入口、一个按钮：文件与文件夹都会结束空态，分两行会把
			// 同一个动作拆成「按钮 + 链接」两种视觉重量。
			open := ui.Button(c, "打开…")
			open.Menu(func(m *ui.Menu) {
				if m.Item("打开文件…").Chosen() {
					a.openFileDialog()
				}
				if m.Item("打开文件夹…").Chosen() {
					a.openFolderDialog()
				}
			})
		})
		return
	}

	// 新建文件/新建文件夹在列表内容顶部成排展示（Obsidian 的资源管理器
	// 头部方式），落在选中的文件夹里；未选中任何目录时落在根目录。
	ui.Row(c).Shrink(0).Padding(6, 10, 4, 6).Gap(2).AlignItems(ui.Center).Children(func() {
		a.panelToolButton(c, iconFilePlus, "新建文件", func() { a.newFileIn(a.createTarget()) })
		a.panelToolButton(c, iconFolderPlus, "新建文件夹", func() { a.newFolderIn(a.createTarget()) })
		ui.Spacer(c)
		a.panelToolButton(c, iconChevron, "全部折叠", a.collapseAll)
	})

	rows := a.fileRows()
	if len(rows) == 0 {
		ui.Column(c).Fill().Center().Gap(6).Padding(20).Children(func() {
			ui.Text(c, "没有可编辑的文本文件").FontSize(12).TextColor(t.TextMuted)
			ui.Text(c, "支持 md / txt / json 等文本类型").FontSize(10.5).TextColor(t.TextMuted)
		})
		return
	}
	ui.List(c, &a.fileList, len(rows), func(i int) {
		r := rows[i]
		row := ui.Row(c).Height(28).Radius(6).Gap(5).
			Padding(0, 8, 0, 4+float32(r.depth*14)).Cursor(ui.CursorPointer)
		switch {
		case r.path == a.selectedPath:
			if t.Dark {
				row.Background(ui.RGBA(255, 255, 255, 0.08))
			} else {
				row.Background(t.Background)
				row.Shadow(0, 0.5, 2, 0, ui.RGBA(0, 0, 0, 0.06))
			}
		case !r.dir && r.path == a.path:
			// 当前打开的文件在树里保持高亮（Obsidian 式）。
			row.Background(t.SurfaceHover)
		case row.Hovered():
			row.Background(t.SurfaceHover)
		}
		row.Children(func() {
			if r.dir {
				if a.expanded[r.path] {
					ui.Icon(c, iconChevronDown).Size(12, 12).TextColor(t.TextMuted)
				} else {
					ui.Icon(c, iconChevron).Size(12, 12).TextColor(t.TextMuted)
				}
				ui.Icon(c, iconFolder).Size(14, 14).TextColor(t.TextMuted)
			} else {
				ui.Box(c).Width(12)
				ui.Icon(c, iconFile).Size(14, 14).TextColor(t.TextMuted)
			}
			ui.Text(c, filepath.Base(r.path)).FontSize(12.5).TextColor(t.Text).
				SingleLine().Ellipsis("…")
		})
		row.OnClick(func() {
			if r.dir {
				// 双击的第二下不算：连点不再表现为"展开又立刻折叠"。
				if last, ok := a.folderToggled[r.path]; ok && time.Since(last) < 300*time.Millisecond {
					return
				}
				a.folderToggled[r.path] = time.Now()
				a.expanded[r.path] = !a.expanded[r.path]
			} else {
				a.selectedPath = r.path
				a.requestOpen(r.path)
			}
		})
		a.fileMenu(c, row, r.path)
	}).Grow(1).Padding(0, 8).Gap(1)
}

type cellEditor struct {
	block, row, col int
	value           string
	wasFocus        bool
}

type fileRow struct {
	path  string
	depth int
	dir   bool
}

func (a *App) fileRows() []fileRow {
	var out []fileRow
	if a.root == "" {
		return nil
	}
	var walk func(dir string, depth int)
	walk = func(dir string, depth int) {
		for _, p := range a.children(dir) {
			dir := a.isDir[p]
			out = append(out, fileRow{path: p, depth: depth, dir: dir})
			if dir && a.expanded[p] {
				walk(p, depth+1)
			}
		}
	}
	walk(a.root, 0)
	return out
}

func (a *App) outlineView(c *ui.Context) {
	t := c.Theme()
	if a.doc == nil || len(a.headings) == 0 {
		ui.Column(c).Fill().Center().Padding(20).Children(func() {
			ui.Text(c, "这篇文档还没有标题").FontSize(12).TextColor(t.TextMuted)
		})
		return
	}
	ui.List(c, &a.outlineState, len(a.headings), func(i int) {
		h := a.headings[i]
		row := ui.Row(c).Height(26).Radius(6).Padding(0, 8, 0, 6+float32(h.level-1)*14).
			Gap(7).AlignItems(ui.Center).Cursor(ui.CursorPointer)
		switch {
		case i == a.outlineRow:
			row.Background(t.SurfaceHover)
		case row.Hovered():
			row.Background(t.SurfaceHover)
		}
		row.Children(func() {
			// 层级条：H1 实心强调点，深层弱化为细条，替代整行大色块
			if i == a.outlineRow {
				ui.Box(c).Width(2.5).Height(14).Radius(1.5).Background(t.Accent)
			} else {
				ui.Box(c).Width(2.5).Height(14).Radius(1.5).Opacity(0)
			}
			label := ui.Text(c, h.text).SingleLine().Ellipsis("…")
			switch {
			case h.level == 1:
				label.FontSize(12.5).FontWeight(600).TextColor(t.Text)
			case h.level == 2:
				label.FontSize(12).FontWeight(500).TextColor(t.Text)
			default:
				label.FontSize(11.5).TextColor(t.TextMuted)
			}
		})
		row.OnClick(func() {
			a.outlineRow = i
			a.scrollTarget = h.block
			// 画布模式下正文在 WebView 里，滚动要经桥发命令。
			a.scrollToHeading(h.text)
		})
	}).Grow(1).Padding(0, 8).Gap(0)
}

// snippetParts splits a search snippet at the first case-insensitive
// occurrence of the query: before, match, after. match is "" when the
// snippet no longer contains the query.
func snippetParts(snippet, query string) (string, string, string) {
	q := strings.ToLower(strings.TrimSpace(query))
	if q == "" {
		return snippet, "", ""
	}
	lower := strings.ToLower(snippet)
	idx := strings.Index(lower, q)
	if idx < 0 {
		return snippet, "", ""
	}
	return snippet[:idx], snippet[idx : idx+len(q)], snippet[idx+len(q):]
}

func (a *App) searchView(c *ui.Context) {
	t := c.Theme()
	ui.Column(c).Fill().Padding(10).Gap(8).Children(func() {
		ui.TextInput(c, &a.query).Placeholder("在当前文档中查找").Label("查找")
		if a.query == "" {
			ui.Text(c, "输入关键词，点击结果跳到对应段落").FontSize(11.5).TextColor(t.TextMuted).Wrap()
			return
		}
		a.searchHits = a.searchHits[:0]
		needle := strings.ToLower(a.query)
		for i, b := range a.blocks {
			if strings.Contains(strings.ToLower(b.Source), needle) {
				a.searchHits = append(a.searchHits, searchHit{block: i, snippet: firstMatchLine(b.Source, needle)})
			}
		}
		a.matches = len(a.searchHits)
		if a.matches == 0 {
			ui.Text(c, "没有匹配").FontSize(11.5).TextColor(t.TextMuted)
			return
		}
		ui.Textf(c, "%d 个段落匹配", a.matches).FontSize(11).TextColor(t.TextMuted)
		ui.List(c, &a.searchState, len(a.searchHits), func(i int) {
			row := ui.Row(c).Height(28).Radius(6).Padding(0, 8).Cursor(ui.CursorPointer)
			switch {
			case i == a.searchRow:
				if t.Dark {
					row.Background(ui.RGBA(255, 255, 255, 0.08))
				} else {
					row.Background(t.Background)
					row.Shadow(0, 0.5, 2, 0, ui.RGBA(0, 0, 0, 0.06))
				}
			case row.Hovered():
				row.Background(t.SurfaceHover)
			}
			row.Children(func() {
				// 行内关键词强调色高亮（首个命中，大小写不敏感）。
				before, hit, after := snippetParts(a.searchHits[i].snippet, a.query)
				ui.Text(c, before).FontSize(11.5).TextColor(t.Text)
				if hit != "" {
					ui.Text(c, hit).FontSize(11.5).FontWeight(620).TextColor(t.Accent)
				}
				ui.Text(c, after).FontSize(11.5).TextColor(t.Text)
			})
			row.OnClick(func() {
				a.searchRow = i
				a.scrollTarget = a.searchHits[i].block
				// 画布模式：滚动经桥，用匹配行文本定位。
				a.scrollToText(a.searchHits[i].snippet)
			})
		}).Grow(1).Gap(1)
	})
}

type searchHit struct {
	block   int
	snippet string
}

// firstMatchLine is the first line of a block holding the needle, trimmed and
// cut for a row: enough to recognise the passage, not the whole paragraph.
func firstMatchLine(source, needle string) string {
	for _, line := range strings.Split(source, "\n") {
		if strings.Contains(strings.ToLower(line), needle) {
			line = strings.TrimSpace(line)
			r := []rune(line)
			if len(r) > 60 {
				return string(r[:60]) + "…"
			}
			return line
		}
	}
	return strings.TrimSpace(source)
}

// ---------------------------------------------------------------------------
// Editor

func (a *App) editorContent(c *ui.Context) {
	ui.Column(c).Fill().Children(func() {
		a.editorHeader(c)
		if a.webView != nil {
			// The canvas owns the document while the web editor runs; the
			// native per-block editors below stay for the fallback path.
			ui.WebView(c, a.webView).Grow(1)
			return
		}
		if a.editing >= 0 && (c.Shortcut(ui.Cmd, ui.KeyEnter) || c.Shortcut(0, ui.KeyEscape)) {
			a.commitBlock()
		}
		if a.cellEdit != nil && c.Shortcut(0, ui.KeyEscape) {
			a.commitCell(a.cellEdit, a.cellEdit.value)
		}
		if a.cellEdit != nil {
			if c.Shortcut(0, ui.KeyTab) {
				a.moveCell(1)
			} else if c.Shortcut(ui.Shift, ui.KeyTab) {
				a.moveCell(-1)
			} else if c.Shortcut(ui.Cmd, ui.KeyEnter) {
				a.insertRowBelowCell()
			}
		}
		a.blockEditor(c)
	})
}

func (a *App) editorHeader(c *ui.Context) {
	t := c.Theme()
	// Windows and Linux put their window buttons at the top right; c.TitleBar
	// says how much room they take, so the view's own controls move in.
	bar := c.TitleBar()
	ui.Row(c).Height(44).Shrink(0).Padding(0, 18+bar.Right, 0, 18).Gap(8).
		DragWindow().
		Children(func() {
			ui.Text(c, a.displayName()).FontSize(13).FontWeight(600).SingleLine().Ellipsis("…")
			if a.dirty {
				ui.Box(c).Size(6, 6).Radius(3).Background(t.Accent)
			}
			if a.path != "" {
				ui.Row(c).Gap(4).Padding(2, 6).Radius(6).Background(t.Surface).Children(func() {
					ui.Icon(c, iconFolder).Size(11, 11).TextColor(t.TextMuted)
					ui.Text(c, a.location()).FontSize(11).TextColor(t.TextMuted).SingleLine().Ellipsis("…")
				})
			}
			ui.Spacer(c)
			chars, _, lines := countText(a.source)
			if a.imageEdit != nil {
				ui.Text(c, "编辑图片 · Esc 完成").FontSize(10.5).TextColor(t.TextMuted).SingleLine().Ellipsis("…")
			} else if a.rich != nil {
				hint := "编辑中 · Enter 新段落 · Esc 完成"
				if a.rich.chrome == "list" {
					hint = "编辑中 · Enter 下一项 · Esc 完成"
				} else if a.rich.chrome == "quote" {
					hint = "编辑中 · Enter 下一行 · Esc 完成"
				}
				ui.Text(c, hint).FontSize(10.5).TextColor(t.TextMuted).SingleLine().Ellipsis("…")
			} else if a.editing >= 0 {
				hint := "编辑中 · Enter 新段落 · Esc 完成"
				if blocks := a.blocks[a.editing].doc.Blocks; len(blocks) > 0 && (blocks[0].Kind == mdoc.Code || blocks[0].Kind == mdoc.Math) {
					hint = "编辑中 · Enter 换行 · Esc 完成"
				}
				ui.Text(c, hint).FontSize(10.5).TextColor(t.TextMuted).SingleLine().Ellipsis("…")
			}
			if a.status != "" {
				ui.Text(c, a.status).FontSize(11).TextColor(t.TextMuted).SingleLine().Ellipsis("…")
			}
			ui.Textf(c, "%d 字 · %d 行", chars, lines).FontSize(11).TextColor(t.TextMuted)
			if a.dirty {
				a.smallIcon(c, iconSave, "保存", func() { a.save() })
			}
		})
}

// ---------------------------------------------------------------------------
// Files

func (a *App) setWorkspace(root string) {
	a.root = root
	a.dirs = map[string][]string{}
	a.isDir = map[string]bool{}
	a.expanded = map[string]bool{}
	a.fileList = ui.ListState{}
	a.selectedPath = ""
	a.children(root)
	a.panel = panelFiles
	a.panelOpen = true
}

func (a *App) children(dir string) []string {
	if entries, ok := a.dirs[dir]; ok {
		return entries
	}
	des, err := os.ReadDir(dir)
	if err != nil {
		a.dirs[dir] = nil
		return nil
	}
	names := make([]string, 0, len(des))
	for _, de := range des {
		name := de.Name()
		if strings.HasPrefix(name, ".") || name == "node_modules" {
			continue
		}
		path := filepath.Join(dir, name)
		if de.IsDir() {
			a.isDir[path] = true
			names = append(names, path)
			continue
		}
		if isEditableFile(path) {
			names = append(names, path)
		}
	}
	sort.SliceStable(names, func(i, j int) bool {
		di, dj := a.isDir[names[i]], a.isDir[names[j]]
		if di != dj {
			return di
		}
		return strings.ToLower(filepath.Base(names[i])) < strings.ToLower(filepath.Base(names[j]))
	})
	a.dirs[dir] = names
	return names
}

func (a *App) startBusy() {
	if a.busy {
		return
	}
	a.busy = true
	if a.win != nil {
		a.win.Invalidate()
	}
}

// finish runs the state change on the UI thread and clears the busy guard.
// Every blocking desktop dialog runs in a goroutine: MyGo's dialogs wait for
// the main loop, so calling one from a click callback deadlocks the window.
func (a *App) onMain(fn func()) {
	if a.win == nil {
		fn()
		return
	}
	mygo.RunOnMain(fn)
}

func (a *App) finish(fn func()) {
	a.onMain(func() {
		if fn != nil {
			fn()
		}
		a.busy = false
		if a.win != nil {
			a.win.Invalidate()
		}
	})
}

func (a *App) snapshotDoc() (dirty bool, name, path, source string) {
	a.onMain(func() {
		dirty, name, path, source = a.dirty, a.displayName(), a.path, a.source
	})
	return
}

func (a *App) openFolderDialog() {
	if a.busy {
		return
	}
	a.startBusy()
	go func() {
		paths, err := openDialog(mygo.OpenDialogOptions{
			Parent:    a.win,
			Title:     "打开文件夹",
			Directory: true,
		})
		a.finish(func() {
			if err == nil && len(paths) > 0 {
				a.setWorkspace(paths[0])
			}
		})
	}()
}

func (a *App) openFileDialog() {
	if a.busy {
		return
	}
	a.startBusy()
	go func() {
		paths, err := openDialog(mygo.OpenDialogOptions{
			Parent: a.win,
			Title:  "打开文本文件",
			Filters: []mygo.FileFilter{
				{Name: "文本文件", Extensions: textFileFilter()},
			},
		})
		if err != nil || len(paths) == 0 {
			a.finish(nil)
			return
		}
		if !a.confirmDiscardOffUI() {
			a.finish(nil)
			return
		}
		data, err := os.ReadFile(paths[0])
		if err != nil {
			errorDialog("打开失败", err.Error())
			a.finish(nil)
			return
		}
		if !isTextData(data) {
			errorDialog("无法打开", "这个文件不是文本文件。")
			a.finish(nil)
			return
		}
		a.finish(func() { a.applyOpen(paths[0], string(data)) })
	}()
}

func (a *App) openPathNow(path string) {
	if !isEditableFile(path) {
		a.notice("不支持的文件类型：" + filepath.Base(path))
		a.invalidate()
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		a.notice(fmt.Sprintf("打开失败：%v", err))
		a.invalidate()
		return
	}
	if !isTextData(data) {
		a.notice("这个文件不是文本文件：" + filepath.Base(path))
		a.invalidate()
		return
	}
	a.applyOpen(path, string(data))
	a.invalidate()
}

// requestOpen opens a path from the UI. A clean document opens at once; an
// edited one asks first, with the dialog off the UI thread.
func (a *App) requestOpen(path string) {
	if a.imageEdit != nil {
		a.commitImage()
	}
	if a.rich != nil {
		a.commitRich()
	}
	if !isEditableFile(path) {
		a.notice("不支持的文件类型：" + filepath.Base(path))
		a.invalidate()
		return
	}
	if !a.dirty {
		a.openPathNow(path)
		return
	}
	if a.win == nil || a.busy {
		return
	}
	a.startBusy()
	go func() {
		if !a.confirmDiscardOffUI() {
			a.finish(nil)
			return
		}
		data, err := os.ReadFile(path)
		if err != nil {
			errorDialog("打开失败", err.Error())
			a.finish(nil)
			return
		}
		a.finish(func() { a.applyOpen(path, string(data)) })
	}()
}

func (a *App) applyOpen(path, data string) {
	a.rich = nil
	a.imageEdit = nil
	a.path = path
	a.selectedPath = path
	a.source = data
	a.refreshDoc()
	a.dirty = false
	a.updateTitle()
	a.pushWebDoc()
}

func (a *App) newDoc() {
	if a.imageEdit != nil {
		a.commitImage()
	}
	if a.rich != nil {
		a.commitRich()
	}
	if !a.dirty {
		a.resetDoc()
		return
	}
	if a.busy {
		return
	}
	a.startBusy()
	go func() {
		if !a.confirmDiscardOffUI() {
			a.finish(nil)
			return
		}
		a.finish(a.resetDoc)
	}()
}

func (a *App) resetDoc() {
	a.path = ""
	a.selectedPath = ""
	a.source = ""
	a.refreshDoc()
	a.pushWebDoc()
	a.dirty = false
	a.updateTitle()
}

func (a *App) save() {
	// The canvas owns the latest keystrokes; collect them before writing.
	a.requestWebSave()
	if a.imageEdit != nil {
		a.commitImage()
	}
	if a.rich != nil {
		a.commitRich()
	}
	if a.path == "" {
		a.saveAs()
		return
	}
	if !isEditableFile(a.path) {
		a.notice("不支持的文件类型：" + filepath.Base(a.path))
		a.invalidate()
		return
	}
	if err := os.WriteFile(a.path, []byte(a.source), 0o644); err != nil {
		a.notice(fmt.Sprintf("保存失败：%v", err))
	} else {
		a.dirty = false
		a.notice("已保存")
	}
	a.updateTitle()
	a.invalidate()
}

// confirmDiscardOffUI asks about an edited document without blocking the UI
// thread. It runs in a goroutine; every state change hops back to the main
// thread. It returns true when it is safe to replace the document.
func (a *App) confirmDiscardOffUI() bool {
	dirty, name, path, source := a.snapshotDoc()
	if !dirty {
		return true
	}
	res, err := messageDialog(mygo.MessageOptions{
		Parent:        a.win,
		Type:          mygo.MessageWarning,
		Message:       "要保存对「" + name + "」的更改吗？",
		Detail:        "如果不保存，更改会丢失。",
		Buttons:       []string{"保存", "不保存", "取消"},
		DefaultButton: 0,
		CancelButton:  2,
	})
	if err != nil || res.Button == 2 {
		return false
	}
	if res.Button == 1 {
		a.onMain(func() { a.dirty = false })
		return true
	}
	savePath := path
	if savePath == "" {
		defaultName := name
		if defaultName == "" || defaultName == "未命名" {
			defaultName = "Untitled.md"
		} else if !strings.HasSuffix(strings.ToLower(defaultName), ".md") {
			defaultName += ".md"
		}
		savePath, err = saveDialog(mygo.SaveDialogOptions{
			Parent:      a.win,
			Title:       "保存文件",
			DefaultPath: defaultName,
			Filters:     []mygo.FileFilter{{Name: "文本文件", Extensions: textFileFilter()}},
		})
		if err != nil || savePath == "" {
			return false
		}
	}
	if !isEditableFile(savePath) {
		errorDialog("无法保存", "请选择文本文件扩展名。")
		return false
	}
	if err := os.WriteFile(savePath, []byte(source), 0o644); err != nil {
		errorDialog("保存失败", err.Error())
		return false
	}
	a.onMain(func() {
		a.path = savePath
		a.selectedPath = savePath
		a.dirty = false
		a.updateTitle()
	})
	return true
}

func (a *App) saveAs() {
	if a.busy {
		return
	}
	if a.imageEdit != nil {
		a.commitImage()
	}
	if a.rich != nil {
		a.commitRich()
	}
	var name, source string
	a.onMain(func() {
		name = "Untitled.md"
		if a.path != "" {
			name = filepath.Base(a.path)
		}
		source = a.source
	})
	a.startBusy()
	go func() {
		path, err := saveDialog(mygo.SaveDialogOptions{
			Parent:      a.win,
			Title:       "保存文件",
			DefaultPath: name,
			Filters:     []mygo.FileFilter{{Name: "文本文件", Extensions: textFileFilter()}},
		})
		if err != nil || path == "" {
			a.finish(nil)
			return
		}
		if !isEditableFile(path) {
			errorDialog("无法保存", "请选择文本文件扩展名。")
			a.finish(nil)
			return
		}
		if err := os.WriteFile(path, []byte(source), 0o644); err != nil {
			errorDialog("保存失败", err.Error())
			a.finish(nil)
			return
		}
		a.finish(func() {
			a.path = path
			a.selectedPath = path
			a.dirty = false
			a.updateTitle()
			a.clearTreeCache()
		})
	}()
}

// collapseAll folds every expanded directory in the tree.
func (a *App) collapseAll() {
	for p := range a.expanded {
		a.expanded[p] = false
	}
	a.folderToggled = map[string]time.Time{}
	a.invalidate()
}

// createTarget is where panel "new" actions land: the selected folder when
// one is selected, otherwise the workspace root.
func (a *App) createTarget() string {
	if a.selectedPath != "" && a.isDir[a.selectedPath] {
		return a.selectedPath
	}
	return a.root
}

// panelToolButton is an icon-only square button for the panel toolbar.
func (a *App) panelToolButton(c *ui.Context, icon *ui.SVG, label string, fn func()) {
	t := c.Theme()
	b := ui.ButtonBase(c).Size(24, 24).Radius(6).Padding(0).
		Justify(ui.Center).AlignItems(ui.Center).Label(label).Tooltip(label)
	if b.Hovered() {
		b.Background(t.SurfaceHover)
	}
	b.OnClick(fn)
	b.Children(func() {
		ui.Icon(c, icon).Size(14, 14).TextColor(t.TextMuted)
	})
}

func (a *App) newFileInRoot() {
	if a.root == "" {
		return
	}
	a.newFileIn(a.root)
}

func (a *App) newFolderInRoot() {
	if a.root == "" {
		return
	}
	a.newFolderIn(a.root)
}

func (a *App) newFileIn(dir string) {
	path := uniquePath(dir, "未命名", ".md")
	if err := os.WriteFile(path, []byte(""), 0o644); err != nil {
		a.notice(fmt.Sprintf("新建失败：%v", err))
		a.invalidate()
		return
	}
	a.clearTreeCache()
	a.requestOpen(path)
}

func (a *App) newFolderIn(dir string) {
	path := uniquePath(dir, "新建文件夹", "")
	if err := os.Mkdir(path, 0o755); err != nil {
		a.notice(fmt.Sprintf("新建失败：%v", err))
	} else {
		a.clearTreeCache()
	}
	a.invalidate()
}

func (a *App) clearTreeCache() {
	a.dirs = map[string][]string{}
	a.isDir = map[string]bool{}
}

// fileMenu is the file tree's context menu: directory actions, path copying
// (relative or absolute), rename, trash and reveal.
func (a *App) fileMenu(c *ui.Context, row ui.Element, path string) {
	row.ContextMenu(func(m *ui.Menu) {
		if a.isDir[path] {
			if m.Item("新建文件").Chosen() {
				a.newFileIn(path)
			}
			if m.Item("新建文件夹").Chosen() {
				a.newFolderIn(path)
			}
			m.Separator()
		}
		if m.Item("复制相对路径").Chosen() {
			a.copyPath(path, true)
		}
		if m.Item("复制绝对路径").Chosen() {
			a.copyPath(path, false)
		}
		m.Separator()
		if m.Item("重命名…").Chosen() {
			a.renamePath = path
			a.renameValue = filepath.Base(path)
			a.renameOpen = true
		}
		if m.Item("移到废纸篓").Chosen() {
			a.trash(path)
		}
		m.Separator()
		if m.Item("在 Finder 中显示").Chosen() {
			mygo.Shell.ShowItemInFolder(path)
		}
	})
}

func (a *App) copyCode(text string) {
	clipboardWrite(text)
	a.notice("已复制代码")
	a.invalidate()
}

func (a *App) copyPath(path string, relative bool) {
	text := path
	if relative {
		if rel, err := filepath.Rel(a.root, path); err == nil && !strings.HasPrefix(rel, "..") {
			text = rel
		}
	}
	clipboardWrite(text)
	if relative {
		a.notice("已复制相对路径")
	} else {
		a.notice("已复制绝对路径")
	}
	a.invalidate()
}

func (a *App) trash(path string) {
	if a.busy {
		return
	}
	a.startBusy()
	go func() {
		name := filepath.Base(path)
		res, err := messageDialog(mygo.MessageOptions{
			Parent:        a.win,
			Type:          mygo.MessageWarning,
			Message:       "确定把「" + name + "」移到废纸篓？",
			Detail:        "可以从废纸篓恢复。",
			Buttons:       []string{"移到废纸篓", "取消"},
			DefaultButton: 0,
			CancelButton:  1,
		})
		if err != nil || res.Button != 0 {
			a.finish(nil)
			return
		}
		if err := trashItem(path); err != nil {
			errorDialog("删除失败", err.Error())
			a.finish(nil)
			return
		}
		a.finish(func() {
			if a.path == path {
				a.path = ""
				a.selectedPath = ""
				a.source = ""
				a.dirty = false
				a.refreshDoc()
				a.updateTitle()
			}
			a.clearTreeCache()
			a.notice("已移到废纸篓")
		})
	}()
}

func (a *App) renameDialog(c *ui.Context) {
	t := c.Theme()
	ui.Modal(c, &a.renameOpen, func() {
		ui.Column(c).Width(420).Gap(12).Padding(18).Radius(12).
			Background(t.Background).Border(1, t.Border).
			Shadow(0, 18, 50, 0, ui.RGBA(0, 0, 0, 0.22)).Children(func() {
			ui.Text(c, "重命名").FontSize(14).FontWeight(600)
			input := ui.TextInput(c, &a.renameValue).AutoFocus().Label("新名称")
			ui.Row(c).Gap(8).Justify(ui.End).Children(func() {
				if ui.Button(c, "取消").Clicked() {
					a.renameOpen = false
				}
				if ui.PrimaryButton(c, "重命名").Clicked() || input.Submitted() {
					a.applyRename()
				}
			})
		})
	})
}

func (a *App) applyRename() {
	name := strings.TrimSpace(a.renameValue)
	if name == "" || a.renamePath == "" {
		a.renameOpen = false
		return
	}
	old := a.renamePath
	newPath := filepath.Join(filepath.Dir(old), name)
	if err := os.Rename(old, newPath); err != nil {
		a.notice(fmt.Sprintf("重命名失败：%v", err))
		a.renameOpen = false
		a.invalidate()
		return
	}
	if a.path == old {
		a.path = newPath
	}
	a.renameOpen = false
	a.renamePath = ""
	a.clearTreeCache()
	a.notice("已重命名")
	a.updateTitle()
	a.invalidate()
}

func uniquePath(dir, base, ext string) string {
	path := filepath.Join(dir, base+ext)
	for i := 2; ; i++ {
		if _, err := os.Stat(path); os.IsNotExist(err) {
			return path
		}
		path = filepath.Join(dir, fmt.Sprintf("%s %d%s", base, i, ext))
	}
}

// ---------------------------------------------------------------------------
// Settings

func (a *App) settingsDialog(c *ui.Context) {
	t := c.Theme()
	w, h := c.Size()
	panelW := min(820, w-64)
	panelH := min(620, h-64)
	maxX := (w-panelW)/2 - 12
	maxY := (h-panelH)/2 - 12
	bounds := ui.Rect{X: -maxX, Y: -maxY, W: 2 * maxX, H: 2 * maxY}
	ui.DialogBase(c, &a.settingsOpen, func(backdrop, panel ui.Element) {
		// term-fleet's settings is a floating window, not a sheet: the page
		// behind stays visible while it is open.
		backdrop.Background(ui.Transparent)
		panel.Width(panelW).Height(panelH).Radius(14).Clip().
			Background(t.Surface).Border(1, t.Border).
			Shadow(0, 18, 50, 0, ui.RGBA(0, 0, 0, 0.28)).
			Draggable(&a.settingsDrag, ui.DraggableOptions{Bounds: &bounds, Rigid: true}).
			Children(func() {
				ui.Row(c).Height(44).Shrink(0).Padding(0, 10, 0, 16).Gap(10).Children(func() {
					ui.Text(c, "设置").FontSize(14).FontWeight(600)
					ui.Text(c, "更改会立即生效").FontSize(11.5).TextColor(t.TextMuted)
					ui.Spacer(c)
					a.smallIcon(c, iconClose, "关闭设置", func() { a.settingsOpen = false })
				})
				ui.Row(c).Grow(1).MinHeight(0).AlignItems(ui.Stretch).Children(func() {
					// Left navigation, 184px.
					ui.Column(c).Width(184).Shrink(0).FillHeight().Padding(0, 8, 8, 4).Gap(2).Children(func() {
						ui.Text(c, "外观").FontSize(11).FontWeight(600).TextColor(t.TextMuted).Padding(10, 10, 4, 10)
						a.settingsNavItem(c, "主题", 0)
						a.settingsNavItem(c, "排版", 1)
						a.settingsNavItem(c, "模型", 2)
					})
					// Right content card, with its own 44px page header.
					ui.Column(c).Grow(1).MinWidth(0).FillHeight().Padding(0, 8, 8, 8).Children(func() {
						card := ui.Column(c).FillWidth().FillHeight().Radius(14).Clip().
							Background(t.Background).Border(1, t.Border)
						card.Children(func() {
							title := "主题"
							switch a.settingsTab {
							case 1:
								title = "排版"
							case 2:
								title = "模型"
							}
							ui.Row(c).Height(44).Shrink(0).Padding(0, 18).AlignItems(ui.Center).
								BorderWidth(0, 0, 1, 0).BorderColor(t.Border).Children(func() {
								ui.Text(c, title).FontSize(15).FontWeight(650)
							})
							ui.Scroll(c).Fill().Children(func() {
								ui.Column(c).FillWidth().Padding(18).Gap(18).Children(func() {
									switch a.settingsTab {
									case 0:
										a.appearanceSettings(c)
									case 1:
										a.typographySettings(c)
									default:
										a.modelSettings(c)
									}
								})
							})
						})
					})
				})
				footer := "设置会立即生效"
				if a.settingsTab == 2 {
					footer = "模型设置保存后生效"
				}
				ui.Row(c).Height(34).Shrink(0).Padding(0, 16).Gap(7).AlignItems(ui.Center).
					BorderWidth(1, 0, 0, 0).BorderColor(t.Border).Children(func() {
					ui.Box(c).Size(6, 6).Radius(3).Background(t.TextMuted)
					ui.Text(c, footer).FontSize(11.5).TextColor(t.TextMuted)
				})
			})
	})
}

func (a *App) settingsNavItem(c *ui.Context, label string, tab int) {
	t := c.Theme()
	b := ui.ButtonBase(c).Width(168).Height(32).Padding(0, 10).Radius(7).Label(label)
	switch {
	case a.settingsTab == tab:
		if t.Dark {
			b.Background(ui.RGBA(255, 255, 255, 0.08))
		} else {
			b.Background(t.Background).Border(1, t.Border)
		}
	case b.Hovered():
		b.Background(t.SurfaceHover)
	}
	b.OnClick(func() { a.settingsTab = tab })
	b.Children(func() {
		ui.Text(c, label).FontSize(13).TextColor(t.Text)
	})
}

// settingsGroup is the inset panel the settings pages group their rows in.
func settingsGroup(c *ui.Context, title string, fn func()) {
	t := c.Theme()
	ui.Column(c).FillWidth().Gap(8).Children(func() {
		if title != "" {
			ui.Text(c, title).FontSize(12).FontWeight(600).TextColor(t.TextMuted).Padding(0, 4)
		}
		ui.Column(c).FillWidth().Radius(12).Background(t.Surface).Padding(4, 16).Children(fn)
	})
}

func settingsRow(c *ui.Context, label, detail string, control func()) {
	t := c.Theme()
	ui.Row(c).FillWidth().Padding(11, 0).Gap(16).AlignItems(ui.Center).Children(func() {
		ui.Column(c).Grow(1).MinWidth(0).Gap(3).Children(func() {
			ui.Text(c, label).FontSize(13.5).TextColor(t.Text)
			if detail != "" {
				ui.Text(c, detail).FontSize(12).TextColor(t.TextMuted).Wrap()
			}
		})
		ui.Row(c).Shrink(0).Gap(8).AlignItems(ui.Center).Children(control)
	})
}

func (a *App) appearanceSettings(c *ui.Context) {
	t := c.Theme()
	settingsGroup(c, "", func() {
		a.settingsDivider(c, false)
		settingsRow(c, "主题", "Rex 色洗的浅色或深色；编辑器、上下文栏与弹层同步切换。", func() {
			ui.Segmented(c, &a.themeMode, "浅色", "深色").Label("主题")
		})
	})
	ui.Text(c, "native 渲染与编辑器共用同一套颜色；切换后立即生效。").
		FontSize(11.5).TextColor(t.TextMuted).Padding(0, 4)
}

func (a *App) typographySettings(c *ui.Context) {
	settingsGroup(c, "", func() {
		a.settingsDivider(c, false)
		settingsRow(c, "字号", "编辑器正文的基准字号。", func() {
			ui.Textf(c, "%.0fpx", a.fontSize).FontSize(12).TextColor(c.Theme().TextMuted).Width(38)
			ui.Slider(c, &a.fontSize, 12, 22).Width(190).Label("字号").
				OnChange(func() { a.pushWebTheme() })
		})
		a.settingsDivider(c, true)
		settingsRow(c, "行高", "正文的行距倍数。", func() {
			ui.Textf(c, "%.1f", a.lineHeight).FontSize(12).TextColor(c.Theme().TextMuted).Width(38)
			ui.Slider(c, &a.lineHeight, 1.4, 2.2).Width(190).Label("行高")
		})
	})
}

// settingsDivider draws the hairline between rows, never above the first or
// below the last, as the platform's settings windows do.
func (a *App) settingsDivider(c *ui.Context, between bool) {
	if between {
		ui.Box(c).FillWidth().Height(1).Background(c.Theme().Border)
	}
}

// ---------------------------------------------------------------------------
// State helpers

func (a *App) refreshDoc() {
	a.blocks = splitSource(a.source)
	a.editing = -1
	a.parseDoc()
}

func (a *App) parseDoc() {
	a.doc = mdoc.Parse(a.source)
	a.headings = a.headings[:0]
	for i, b := range a.blocks {
		for _, bb := range b.doc.Blocks {
			if bb.Kind == mdoc.Heading {
				a.headings = append(a.headings, heading{
					level: bb.Level,
					text:  strings.TrimSpace(plainSpans(bb.Inlines)),
					block: i,
				})
			}
		}
	}
}

// blockEditor draws the rendered document, and one block as an input while it
// is edited. Clicking a block starts there; the block's source replaces only
// its own range, so the rest of the document is untouched.
func (a *App) docDir() string {
	if a.path != "" {
		return filepath.Dir(a.path)
	}
	return a.root
}

func (a *App) blockEditor(c *ui.Context) {
	t := c.Theme()
	ui.Scroll(c).Fill().Children(func() {
		ui.Column(c).FillWidth().MaxWidth(800).Margin(0, ui.Auto).Padding(36, 32, 80, 32).
			Children(func() {
				if len(a.blocks) == 0 {
					ui.Column(c).FillWidth().Padding(20).Center().Gap(10).Children(func() {
						ui.Text(c, "空文档").FontSize(13).TextColor(t.TextMuted)
						ui.Button(c, "开始写作").OnClick(a.startBlankBlock)
					})
					return
				}
				for i := range a.blocks {
					if a.imageEdit != nil && a.imageEdit.block == i {
						a.imageEditView(c)
						continue
					}
					if a.rich != nil && a.rich.block == i {
						a.richView(c)
						continue
					}
					if i == a.editing {
						a.blockInput(c)
						continue
					}
					a.blockView(c, i)
				}
				ui.Box(c).Height(24)
			})
	})
}

func isListItemBlock(b sourceBlock) bool {
	if len(b.doc.Blocks) != 1 {
		return false
	}
	bb := b.doc.Blocks[0]
	return bb.Kind == mdoc.List && len(bb.Items) == 1
}

func isQuoteLineBlock(b sourceBlock) bool {
	return len(b.doc.Blocks) == 1 && b.doc.Blocks[0].Kind == mdoc.Quote
}

func (a *App) blockView(c *ui.Context, i int) {
	padY := float32(6)
	if isListItemBlock(a.blocks[i]) {
		padY = 1
	}
	if isQuoteLineBlock(a.blocks[i]) {
		padY = 0
	}
	row := ui.Column(c).FillWidth().Padding(padY, 10).Radius(6).
		Cursor(ui.CursorText)
	row.OnClick(func() {
		if a.cellEdit != nil && a.cellEdit.block == i {
			// The click already chose a table cell; the row must not also open
			// the whole table's source.
			return
		}
		if bs := a.blocks[i].doc.Blocks; len(bs) > 0 {
			switch bs[0].Kind {
			case mdoc.Table, mdoc.Rule:
				// Table structure is chrome; cells edit themselves. Rules are
				// contentless.
				return
			case mdoc.HTML:
				// HTML blocks edit as raw source (like code, without fences).
			}
		}
		x, y, over := row.PointerPosition()
		if !over {
			x, y = -1, -1
		}
		if a.imageEdit != nil {
			a.commitImage()
		}
		if a.rich != nil {
			a.commitRich()
		}
		if a.beginImageEdit(i) {
			return
		}
		if a.beginRichEditAt(i, x, y) {
			return
		}
		a.beginBlockEditAt(i, x, y)
	})
	if bs := a.blocks[i].doc.Blocks; len(bs) > 0 && bs[0].Kind == mdoc.Table {
		a.tableMenu(row, i)
	}
	row.Children(func() {
		opts := mdoc.Options{
			BodyFontSize: float32(a.fontSize),
			BaseDir:      a.docDir(),
			ContentWidth: 800,
			OnTask: func(item int, checked bool) {
				a.toggleTask(i, item, checked)
			},
			OnCell: func(row, col int) {
				a.startCellEdit(i, row, col)
			},
			OnAsync: a.invalidate,
			OnCopyCode: func(text string) {
				a.copyCode(text)
			},
		}
		if a.cellEdit != nil && a.cellEdit.block == i {
			ce := a.cellEdit
			opts.CellEdit = &mdoc.CellEditor{
				Row:      ce.row,
				Col:      ce.col,
				Value:    &ce.value,
				WasFocus: &ce.wasFocus,
			}
			opts.OnCellCommit = func(row, col int, value string) {
				a.commitCell(ce, value)
			}
		}
		mdoc.BlocksView(c, a.blocks[i].doc.Blocks, opts)
	})
	if i == a.scrollTarget {
		row.ScrollIntoView()
		a.scrollTarget = -1
	}
}

func (a *App) blockInput(c *ui.Context) {
	t := c.Theme()
	mods := c.Modifiers()
	kind := mdoc.Paragraph
	if a.editing >= 0 && a.editing < len(a.blocks) {
		if blocks := a.blocks[a.editing].doc.Blocks; len(blocks) > 0 {
			kind = blocks[0].Kind
		}
	}

	size := float32(a.fontSize)
	lineHeight := float32(a.lineHeight)
	font := ""
	switch kind {
	case mdoc.Heading:
		level := 1
		if blocks := a.blocks[a.editing].doc.Blocks; len(blocks) > 0 {
			level = blocks[0].Level
		}
		size = mdoc.HeadingSize(level, float32(a.fontSize))
		lineHeight = 1.3
	case mdoc.Code:
		size = float32(a.fontSize - 1)
		lineHeight = 1.55
		font = "monospace"
	}

	// The block stays in place: no box, no chrome, just an editable run of
	// text at the same width and padding as the rendered block. Only a code
	// block keeps its filled panel, as Typora's does.
	padY := float32(6)
	padTop := padY
	if a.editing >= 0 && a.editing < len(a.blocks) {
		if isListItemBlock(a.blocks[a.editing]) {
			padY = 1
			padTop = 1
		}
		if isQuoteLineBlock(a.blocks[a.editing]) {
			padY = 0
			padTop = 0
		}
	}
	// Match the extra top padding the rendered heading has, so clicking a
	// heading does not shift the rest of the document by 5-12px.
	if kind == mdoc.Heading {
		level := 1
		if blocks := a.blocks[a.editing].doc.Blocks; len(blocks) > 0 {
			level = blocks[0].Level
		}
		switch level {
		case 1:
			padTop += 12
		case 2:
			padTop += 8
		case 3:
			padTop += 5
		}
	}
	ui.Column(c).FillWidth().Padding(padTop, 10, padY, 10).Children(func() {
		weight := 0
		if kind == mdoc.Heading {
			level := 1
			if blocks := a.blocks[a.editing].doc.Blocks; len(blocks) > 0 {
				level = blocks[0].Level
			}
			weight = 700
			if level > 2 {
				weight = 650
			}
		}
		if a.editHandle == nil {
			h := ui.Handle{}
			a.editHandle = &h
		}
		codeLang := ""
		if kind == mdoc.Code {
			if blocks := a.blocks[a.editing].doc.Blocks; len(blocks) > 0 {
				codeLang = blocks[0].Lang
			}
			if codeLang != "" {
				ui.Row(c).Padding(0, 0, 6, 2).Children(func() {
					ui.Text(c, codeLang).FontSize(10.5).TextColor(t.TextMuted).SingleLine()
				})
			}
		}
		if kind == mdoc.Math {
			if bmp := mdoc.RenderMath(a.editSource, 18, t.Dark); bmp != nil {
				w, h := bmp.Size()
				fw := float32(w) * 72 / 192 * 1.4
				fh := float32(h) * 72 / 192 * 1.4
				maxW := float32(660)
				if fw > maxW {
					fh = fh * maxW / fw
					fw = maxW
				}
				ui.Row(c).FillWidth().Justify(ui.Center).Padding(0, 0, 8, 0).Children(func() {
					ui.Image(c, bmp).Size(fw, fh)
				})
			}
		}
		ta := ui.TextAreaBase(c, &a.editSource).
			Bind(a.editHandle).
			Lines(1, 40).
			FontSize(size).LineHeight(lineHeight).
			TextColor(t.Text).Label("编辑块").
			OnPaste(func(string) bool {
				a.editPasted = true
				return false
			})
		if a.editAutoFocus {
			a.editAutoFocus = false
			ta.Focus()
		}
		if weight > 0 {
			ta.FontWeight(weight)
		}
		ta.HandleInput(func(ev ui.InputEvent) bool {
			if ev.Kind == ui.InputText {
				return a.autoPair(ev.Text)
			}
			if ev.Kind != ui.InputKeyDown {
				return false
			}
			start, end := a.editSelStart, a.editSelEnd
			if ev.Mods == ui.Cmd {
				switch ev.Key {
				case ui.KeyB:
					a.wrapEdit(start, end, "**")
					return true
				case ui.KeyI:
					a.wrapEdit(start, end, "*")
					return true
				case ui.KeyU:
					a.wrapEdit(start, end, "~~")
					return true
				case ui.KeyE:
					a.wrapEdit(start, end, "`")
					return true
				case ui.KeyK:
					a.insertLink(start, end)
					return true
				case ui.Key0:
					a.setHeading(0)
					return true
				}
				if ev.Key >= ui.Key1 && ev.Key <= ui.Key6 {
					a.setHeading(int(ev.Key - ui.Key0))
					return true
				}
			}
			if ev.Mods == ui.Shift {
				switch ev.Key {
				case ui.KeyTab:
					a.indentEdit(start, end, true)
					return true
				case ui.KeyDown:
					return a.extendSelectionDown()
				case ui.KeyUp:
					return a.extendSelectionUp()
				}
				return false
			}
			if ev.Mods == 0 && ev.Key == ui.KeyTab {
				a.indentEdit(start, end, false)
				return true
			}
			if ev.Mods != 0 {
				return false
			}
			return a.handleBlockArrow(start, end, ev.Key)
		})
		if font != "" {
			ta.Font(font)
		}
		switch kind {
		case mdoc.Code:
			ta.Padding(14, 16).Radius(4).Background(t.Surface)
		case mdoc.Math:
			ta.Padding(10, 12).Radius(4).Background(t.Surface).Font("monospace")
			ta.FontSize(float32(a.fontSize) - 2)
		case mdoc.Quote:
			ta.Padding(0, 0, 0, 16).BorderWidth(0, 0, 0, 3).BorderColor(t.Border)
			ta.TextColor(t.TextMuted)
		default:
			ta.Padding(0)
		}
		if kind == mdoc.Code {
			ta.TextRanges(codeRanges(a.editSource, codeLang, t)...)
		} else if kind != mdoc.Math {
			ta.TextRanges(markdownRanges(a.editSource, t)...)
		}
		if a.editCaretSet {
			end := a.editCaretTarget
			if a.editSelectEnd > end {
				end = a.editSelectEnd
			}
			ta.SetTextSelection(a.editCaretTarget, end)
			a.editCaretSet = false
			a.editSelectEnd = 0
		} else if a.editPlaceCaret {
			caret := a.caretFromPoint(c, kind, a.editClickX, a.editClickY, size, lineHeight, font, a.blockTextWidth(c))
			ta.SetTextSelection(caret, caret)
			a.editPlaceCaret = false
		}
		if ta.Changed() {
			cut := -1
			if !a.editPasted && canSplitBlock(kind) {
				cut = newlineInsertion(a.editBefore, a.editSource)
			}
			if cut >= 0 && mods&ui.Shift == 0 {
				a.splitBlockAtNewline(cut)
				return
			}
			if cut >= 0 && mods&ui.Shift != 0 {
				// Shift+Enter is Markdown's hard break: two spaces before the
				// newline keeps it inside the paragraph, and the caret moves
				// after the break so typing continues on the next line.
				a.editSource = a.editSource[:cut] + "  " + a.editSource[cut:]
				a.editCaretSet = true
				a.editCaretTarget = len([]rune(a.editSource[:cut+3]))
				a.editPlaceCaret = false
			}
			a.editPasted = false
			a.applyBlockEdit()
			a.editBefore = a.editSource
		}
		focused := ta.Focused()
		if a.editWasFocus && !focused {
			a.commitBlock()
			return
		}
		if focused {
			a.editWasFocus = true
		}
		a.editSelStart, a.editSelEnd = ta.TextSelection()
	})
}

func (a *App) beginBlockEdit(i int) {
	a.beginBlockEditAt(i, -1, -1)
}

func (a *App) beginBlockEditAt(i int, x, y float32) {
	if i < 0 || i >= len(a.blocks) {
		return
	}
	if a.imageEdit != nil {
		a.commitImage()
	}
	if a.rich != nil {
		a.commitRich()
	}
	if a.editing == i {
		return
	}
	if a.cellEdit != nil {
		a.commitCell(a.cellEdit, a.cellEdit.value)
	}
	if a.editing >= 0 {
		a.commitBlock()
	}
	b := a.blocks[i]
	content, prefix, suffix := "", "", ""
	if blocks := b.doc.Blocks; len(blocks) > 0 && blocks[0].Kind == mdoc.Code {
		prefix, content, suffix = codeFenceParts(b.Source)
	} else if len(blocks) > 0 && blocks[0].Kind == mdoc.Math {
		prefix, content, suffix = mathFenceParts(b.Source)
	} else {
		content = b.Source
	}
	a.editing = i
	a.editSource = content
	a.editAffixPrefix = prefix
	a.editAffixSuffix = suffix
	a.editStart = b.Start
	a.editEnd = b.End
	a.editWasFocus = false
	a.editClickX, a.editClickY = x, y
	a.editPlaceCaret = x >= 0 && y >= 0
	a.editBefore = a.editSource
	a.editPasted = false
	a.editCaretSet = false
	a.editAutoFocus = true
	h := ui.Handle{}
	a.editHandle = &h
	a.editSelStart, a.editSelEnd = 0, 0
	a.editSelectEnd = 0
}

// caretFromPoint turns the click in the rendered block into a rune offset in
// its Markdown source. The text is laid out with the same font and line
// height as the editor, so a click lands near the character under it; markup
// markers make the mapping approximate, as in any source-based inline editor.
func (a *App) blockTextWidth(c *ui.Context) float32 {
	w, _ := c.Size()
	card := w - railWidth - a.canvasLeft(c) - 8 - a.panelW
	content := card
	if content > 800 {
		content = 800
	}
	return content - 64 - 20
}

// caretFromPoint turns the click in the rendered block into a rune offset in
// its Markdown source. It wraps the source at the editor's width, picks the
// visual line under the pointer and measures the prefix to the nearest rune;
// markup markers make the mapping approximate, as in any source-based inline
// editor.
func (a *App) caretFromPoint(c *ui.Context, kind mdoc.Kind, x, y, size, lineHeight float32, font string, width float32) int {
	src := []rune(a.editSource)
	if len(src) == 0 {
		return 0
	}
	padX, padY := float32(10), float32(5)
	textW := width
	switch kind {
	case mdoc.Code:
		padX, padY = 26, 19
		textW -= 32
	case mdoc.Quote:
		padX = 26
		textW -= 16
	}
	x -= padX
	y -= padY
	if x < 0 {
		x = 0
	}
	if y < 0 {
		y = 0
	}
	if textW < 40 {
		textW = 40
	}

	type vline struct{ start, end int }
	var lines []vline
	offset := 0
	for _, raw := range strings.Split(a.editSource, "\n") {
		runes := []rune(raw)
		if len(runes) == 0 {
			lines = append(lines, vline{offset, offset})
			offset++
			continue
		}
		start := 0
		for start < len(runes) {
			end := start + 1
			for end <= len(runes) {
				w, _ := c.MeasureText(0, ui.Span{Text: string(runes[start:end]), Font: font, Size: size})
				if w > textW && end-start > 1 {
					break
				}
				end++
			}
			if end > len(runes) {
				end = len(runes)
			}
			lines = append(lines, vline{offset + start, offset + end})
			start = end
		}
		offset += len(runes) + 1
	}
	if len(lines) == 0 {
		return 0
	}

	line := 0
	if lh := size * lineHeight; lh > 0 {
		line = int(y / lh)
	}
	if line < 0 {
		line = 0
	}
	if line >= len(lines) {
		line = len(lines) - 1
	}
	vl := lines[line]
	best, bestDist := vl.start, float32(1<<30)
	for i := vl.start; i <= vl.end && i <= len(src); i++ {
		w, _ := c.MeasureText(0, ui.Span{Text: string(src[vl.start:i]), Font: font, Size: size})
		d := w - x
		if d < 0 {
			d = -d
		}
		if d < bestDist {
			best, bestDist = i, d
		}
	}
	if best < 0 {
		return 0
	}
	if best > len(src) {
		return len(src)
	}
	return best
}

// toggleTask flips the item-th task marker in a list block's raw source.
func (a *App) toggleTask(block, item int, checked bool) {
	// The task box is clickable while the item is in rich editing: toggle the
	// run model there and let the rich commit serialize [x]/[ ].
	if r := a.rich; r != nil && r.block == block && r.task {
		if r.checked != checked {
			r.toggleTask()
		}
		a.richDirty()
		a.invalidate()
		return
	}
	if block < 0 || block >= len(a.blocks) {
		return
	}
	b := a.blocks[block]
	src := b.Source
	offset, seen := -1, 0
	for i := 0; i+2 < len(src); i++ {
		if src[i] == '[' && (src[i+1] == ' ' || src[i+1] == 'x' || src[i+1] == 'X') && src[i+2] == ']' {
			if seen == item {
				offset = i
				break
			}
			seen++
		}
	}
	if offset < 0 {
		return
	}
	mark := "[ ]"
	if checked {
		mark = "[x]"
	}
	next := src[:offset] + mark + src[offset+3:]
	a.source = a.source[:b.Start] + next + a.source[b.End:]
	a.refreshDoc()
	a.dirty = true
	a.updateTitle()
	a.invalidate()
}

func (a *App) moveCell(dir int) {
	ce := a.cellEdit
	if ce == nil || ce.block < 0 || ce.block >= len(a.blocks) {
		return
	}
	b := a.blocks[ce.block]
	if len(b.doc.Blocks) == 0 || b.doc.Blocks[0].Kind != mdoc.Table {
		return
	}
	rows := len(b.doc.Blocks[0].Rows)
	cols := 0
	for _, r := range b.doc.Blocks[0].Rows {
		if len(r) > cols {
			cols = len(r)
		}
	}
	if cols == 0 {
		return
	}
	row, col := ce.row, ce.col+dir
	if col >= cols {
		row++
		col = 0
	}
	if col < 0 {
		row--
		col = cols - 1
	}
	if row < 0 {
		row = rows - 1
		col = cols - 1
	}
	appendRow := row >= rows
	if appendRow {
		row = rows
		col = 0
	}
	a.commitCell(ce, ce.value)
	if appendRow && !a.appendTableRow(ce.block, cols) {
		return
	}
	a.startCellEdit(ce.block, row, col)
	a.invalidate()
}

func (a *App) appendTableRow(block, cols int) bool {
	if block < 0 || block >= len(a.blocks) {
		return false
	}
	b := a.blocks[block]
	if b.Source == "" {
		return false
	}
	row := "|" + strings.Repeat("   |", cols)
	next := b.Source + "\n" + row
	a.source = a.source[:b.Start] + next + a.source[b.End:]
	a.refreshDoc()
	a.dirty = true
	a.updateTitle()
	return true
}

func (a *App) startCellEdit(block, row, col int) {
	if block < 0 || block >= len(a.blocks) {
		return
	}
	if a.cellEdit != nil {
		if a.cellEdit.block == block && a.cellEdit.row == row && a.cellEdit.col == col {
			return
		}
		a.commitCell(a.cellEdit, a.cellEdit.value)
	}
	if a.editing >= 0 {
		a.commitBlock()
	}
	if block >= len(a.blocks) {
		return
	}
	line, ok := tableSourceLine(a.blocks[block].Source, row)
	if !ok {
		return
	}
	parts, _, _ := splitTableLine(line)
	if col < 0 || col >= len(parts) {
		return
	}
	a.cellEdit = &cellEditor{
		block: block,
		row:   row,
		col:   col,
		value: strings.TrimSpace(parts[col]),
	}
	a.invalidate()
}

func (a *App) commitCell(ce *cellEditor, value string) {
	if ce == nil || a.cellEdit != ce {
		return
	}
	a.cellEdit = nil
	if ce.block < 0 || ce.block >= len(a.blocks) {
		return
	}
	b := a.blocks[ce.block]
	lines := strings.Split(b.Source, "\n")
	idx := 0
	if ce.row > 0 {
		idx = ce.row + 1
	}
	if idx < 0 || idx >= len(lines) {
		return
	}
	parts, lead, trail := splitTableLine(lines[idx])
	if ce.col < 0 || ce.col >= len(parts) {
		return
	}
	seg := parts[ce.col]
	left := seg[:len(seg)-len(strings.TrimLeft(seg, " \t"))]
	right := seg[len(strings.TrimRight(seg, " \t")):]
	value = strings.ReplaceAll(value, "|", "\\|")
	parts[ce.col] = left + value + right
	lines[idx] = joinTableLine(parts, lead, trail)
	next := strings.Join(lines, "\n")
	if next != b.Source {
		a.source = a.source[:b.Start] + next + a.source[b.End:]
		a.refreshDoc()
		a.dirty = true
		a.updateTitle()
	}
	a.invalidate()
}

// tableSourceLine maps a rendered table row to its line in the block source:
// row 0 is the header, row 1 the first body row, with the alignment line in
// between.
func tableSourceLine(src string, row int) (string, bool) {
	lines := strings.Split(src, "\n")
	idx := 0
	if row > 0 {
		idx = row + 1
	}
	if idx < 0 || idx >= len(lines) {
		return "", false
	}
	return lines[idx], true
}

func splitTableLine(line string) (parts []string, lead, trail bool) {
	trimmed := strings.TrimSpace(line)
	lead = strings.HasPrefix(trimmed, "|")
	trail = strings.HasSuffix(trimmed, "|")
	if lead {
		trimmed = trimmed[1:]
	}
	if trail && len(trimmed) > 0 {
		trimmed = trimmed[:len(trimmed)-1]
	}
	return strings.Split(trimmed, "|"), lead, trail
}

func joinTableLine(parts []string, lead, trail bool) string {
	s := strings.Join(parts, "|")
	if lead {
		s = "|" + s
	}
	if trail {
		s += "|"
	}
	return s
}

// ---------------------------------------------------------------------------
// Table structure commands: rows and columns are edited through the block's
// source lines, keeping the alignment row in sync with every mutation.

// tableColumnCount reads the table's column count from its alignment line.
func tableColumnCount(src string) int {
	lines := strings.Split(src, "\n")
	if len(lines) < 2 {
		return 0
	}
	parts, _, _ := splitTableLine(lines[1])
	return len(parts)
}

// tableRows counts rendered rows (header + body rows).
func tableRows(b sourceBlock) int {
	if len(b.doc.Blocks) == 0 || b.doc.Blocks[0].Kind != mdoc.Table {
		return 0
	}
	return len(b.doc.Blocks[0].Rows)
}

// mutateTable rewrites the table block's source through fn and refreshes.
func (a *App) mutateTable(block int, fn func(lines []string) []string) bool {
	if block < 0 || block >= len(a.blocks) {
		return false
	}
	b := a.blocks[block]
	if b.Source == "" {
		return false
	}
	next := strings.Join(fn(strings.Split(b.Source, "\n")), "\n")
	if next == b.Source {
		return false
	}
	a.source = a.source[:b.Start] + next + a.source[b.End:]
	a.refreshDoc()
	a.dirty = true
	a.updateTitle()
	a.invalidate()
	return true
}

// tableAnchor commits an open cell edit and returns its row/col as the
// anchor for structure commands.
func (a *App) tableAnchor(block int) (row, col int, ok bool) {
	if a.cellEdit != nil && a.cellEdit.block == block {
		ce := a.cellEdit
		a.commitCell(ce, ce.value)
		return ce.row, ce.col, true
	}
	return 1, 0, false
}

// insertTableRowBelow inserts an empty body row after rendered row at
// (at < 0 or past the end appends after the last row).
func (a *App) insertTableRowBelow(block, at int) bool {
	if block < 0 || block >= len(a.blocks) {
		return false
	}
	cols := tableColumnCount(a.blocks[block].Source)
	if cols == 0 {
		return false
	}
	rows := tableRows(a.blocks[block])
	row := at
	if row < 0 || row >= rows {
		row = rows - 1
	}
	return a.mutateTable(block, func(lines []string) []string {
		idx := row + 2 // row 0 → after the alignment line; row r → after line r+1
		if idx > len(lines) {
			idx = len(lines)
		}
		empty := "|" + strings.Repeat("   |", cols)
		out := make([]string, 0, len(lines)+1)
		out = append(out, lines[:idx]...)
		out = append(out, empty)
		return append(out, lines[idx:]...)
	})
}

// deleteTableRow removes the body row at rendered row at. The header and
// alignment lines are chrome and cannot be deleted.
func (a *App) deleteTableRow(block, at int) bool {
	if at < 1 {
		return false
	}
	return a.mutateTable(block, func(lines []string) []string {
		idx := at + 1
		if idx >= len(lines) {
			return lines
		}
		return append(lines[:idx], lines[idx+1:]...)
	})
}

// alignmentStyle mirrors a neighbour alignment cell's colon style.
func alignmentStyle(seg string) string {
	s := strings.TrimSpace(seg)
	left := strings.HasPrefix(s, ":")
	right := strings.HasSuffix(s, ":") && len(s) > 1
	switch {
	case left && right:
		return ":---:"
	case right:
		return "---:"
	case left:
		return ":---"
	default:
		return "---"
	}
}

// insertTableColumnAt inserts an empty column before rendered column at
// (at == cols appends after the last column). The alignment line's new
// cell mirrors the neighbour's colon style.
func (a *App) insertTableColumnAt(block, at int) bool {
	if block < 0 || block >= len(a.blocks) {
		return false
	}
	cols := tableColumnCount(a.blocks[block].Source)
	if cols == 0 {
		return false
	}
	if at < 0 {
		at = 0
	}
	if at > cols {
		at = cols
	}
	return a.mutateTable(block, func(lines []string) []string {
		out := make([]string, len(lines))
		for i, line := range lines {
			parts, lead, trail := splitTableLine(line)
			if len(parts) != cols {
				out[i] = line // 结构不齐的行保持原样
				continue
			}
			seg := "   "
			if i == 1 {
				style := "---"
				if at > 0 {
					style = alignmentStyle(parts[at-1])
				} else if len(parts) > 0 {
					style = alignmentStyle(parts[0])
				}
				neighbour := at
				if neighbour >= len(parts) {
					neighbour = len(parts) - 1
				}
				p := parts[neighbour]
				left := p[:len(p)-len(strings.TrimLeft(p, " \t"))]
				right := p[len(strings.TrimRight(p, " \t")):]
				seg = left + style + right
			}
			next := append(append([]string{}, parts[:at]...), seg)
			next = append(next, parts[at:]...)
			out[i] = joinTableLine(next, lead, trail)
		}
		return out
	})
}

// deleteTableColumnAt removes rendered column at from every line and refuses
// to reduce the table below one column.
func (a *App) deleteTableColumnAt(block, at int) bool {
	if block < 0 || block >= len(a.blocks) {
		return false
	}
	cols := tableColumnCount(a.blocks[block].Source)
	if cols <= 1 {
		a.notice("表格至少保留一列")
		return false
	}
	if at < 0 || at >= cols {
		return false
	}
	return a.mutateTable(block, func(lines []string) []string {
		out := make([]string, len(lines))
		for i, line := range lines {
			parts, lead, trail := splitTableLine(line)
			if len(parts) != cols {
				out[i] = line
				continue
			}
			next := append(append([]string{}, parts[:at]...), parts[at+1:]...)
			out[i] = joinTableLine(next, lead, trail)
		}
		return out
	})
}

// tableMenu attaches the row/column commands to a rendered table. The
// commands anchor to the cell being edited; without one, insertion appends
// at the end and the delete items are not offered.
func (a *App) tableMenu(el ui.Element, block int) {
	el.ContextMenu(func(m *ui.Menu) {
		row, col, hasAnchor := a.tableAnchor(block)
		if m.Item("在下方插入行").Chosen() {
			a.insertTableRowBelow(block, row)
		}
		if hasAnchor && row >= 1 && m.Item("删除此行").Chosen() {
			a.deleteTableRow(block, row)
		}
		m.Separator()
		if m.Item("在左侧插入列").Chosen() {
			a.insertTableColumnAt(block, col)
		}
		if m.Item("在右侧插入列").Chosen() {
			a.insertTableColumnAt(block, col+1)
		}
		if hasAnchor && m.Item("删除此列").Chosen() {
			a.deleteTableColumnAt(block, col)
		}
	})
}

// insertRowBelowCell commits the cell and starts editing a fresh row below
// it, same column (Cmd+Enter inside a cell).
func (a *App) insertRowBelowCell() {
	ce := a.cellEdit
	if ce == nil {
		return
	}
	block, row, col := ce.block, ce.row, ce.col
	a.commitCell(ce, ce.value)
	if !a.insertTableRowBelow(block, row) {
		return
	}
	a.startCellEdit(block, row+1, col)
	a.invalidate()
}

func canSplitBlock(kind mdoc.Kind) bool {
	switch kind {
	case mdoc.Paragraph, mdoc.Heading, mdoc.List, mdoc.Quote:
		return true
	}
	return false
}

// newlineInsertion reports where a single newline was inserted, if it was the
// only change. That is how a TextArea's Enter arrives: it has no Submitted.
func newlineInsertion(prev, cur string) int {
	if len(cur) != len(prev)+1 {
		return -1
	}
	i := 0
	for i < len(prev) && prev[i] == cur[i] {
		i++
	}
	if i < len(cur) && cur[i] == '\n' {
		return i
	}
	return -1
}

// splitBlockAtNewline turns Enter in a paragraph, heading, list item or quote
// line into a new editable block, as Typora does, instead of a soft newline.
func (a *App) splitBlockAtNewline(cut int) {
	if a.editing < 0 || a.editing >= len(a.blocks) {
		return
	}
	b := a.blocks[a.editing]
	src := a.editSource
	if cut < 0 || cut >= len(src) || src[cut] != '\n' {
		a.applyBlockEdit()
		return
	}
	before, after := src[:cut], src[cut+1:]

	kind := mdoc.Paragraph
	if blocks := b.doc.Blocks; len(blocks) > 0 {
		kind = blocks[0].Kind
	}
	sep := "\n\n"
	newSource := after
	caret := 0
	switch kind {
	case mdoc.List:
		sep = "\n"
		marker := listMarker(src)
		newSource = marker + after
		caret = len([]rune(marker))
	case mdoc.Quote:
		sep = "\n"
		marker := "> "
		newSource = marker + after
		caret = len([]rune(marker))
	}

	newText := before + sep + newSource
	pos := b.Start + len(before) + len(sep)
	a.source = a.source[:b.Start] + newText + a.source[b.End:]
	a.refreshDoc()

	idx := -1
	if newSource != "" {
		for i := range a.blocks {
			if a.blocks[i].Start == pos {
				idx = i
				break
			}
		}
	}
	if idx < 0 {
		if newSource != "" {
			a.applyBlockEdit()
			return
		}
		// A new empty paragraph needs a block to type into; the source has a
		// blank gap, so insert a transient block at that position.
		idx = 0
		for idx < len(a.blocks) && a.blocks[idx].Start < pos {
			idx++
		}
		a.blocks = append(a.blocks, sourceBlock{})
		copy(a.blocks[idx+1:], a.blocks[idx:])
		a.blocks[idx] = sourceBlock{Start: pos, End: pos, Source: "", doc: mdoc.Parse("")}
	}
	if idx >= len(a.blocks) {
		a.editing = -1
		return
	}
	x := a.blocks[idx]
	a.editing = idx
	a.editSource = x.Source
	a.editAffixPrefix = ""
	a.editAffixSuffix = ""
	a.editStart = x.Start
	a.editEnd = x.End
	a.editWasFocus = false
	a.editBefore = a.editSource
	a.editPasted = false
	a.editPlaceCaret = false
	a.editCaretSet = true
	a.editCaretTarget = caret
	a.editAutoFocus = true
	h := ui.Handle{}
	a.editHandle = &h
	a.editSelStart, a.editSelEnd = 0, 0
	a.editSelectEnd = 0
	a.dirty = true
	a.updateTitle()
	a.invalidate()
}

func listMarker(src string) string {
	lower := strings.ToLower(src)
	for _, task := range []string{"- [ ] ", "- [x] ", "* [ ] ", "* [x] ", "+ [ ] ", "+ [x] "} {
		if strings.HasPrefix(lower, task) {
			return "- [ ] "
		}
	}
	for _, p := range []string{"- ", "* ", "+ "} {
		if strings.HasPrefix(src, p) {
			return p
		}
	}
	i := 0
	for i < len(src) && i < 3 && src[i] >= '0' && src[i] <= '9' {
		i++
	}
	if i > 0 && i+1 < len(src) && (src[i] == '.' || src[i] == ')') && src[i+1] == ' ' {
		return src[:i+2]
	}
	return "- "
}

func (a *App) handleBlockArrow(start, end int, key ui.Key) bool {
	if a.editing < 0 {
		return false
	}
	n := len([]rune(a.editSource))
	switch key {
	case ui.KeyRight, ui.KeyDown:
		if start == end && end >= n && a.editing+1 < len(a.blocks) {
			a.moveEditTo(a.editing+1, 0)
			return true
		}
	case ui.KeyLeft, ui.KeyUp:
		if start == end && start <= 0 && a.editing > 0 {
			prev := a.editing - 1
			a.moveEditTo(prev, len([]rune(a.blocks[prev].Source)))
			return true
		}
	}
	return false
}

func (a *App) moveEditTo(idx, caret int) {
	if idx < 0 || idx >= len(a.blocks) {
		return
	}
	a.applyBlockEdit()
	a.commitBlock()
	a.beginBlockEditAt(idx, -1, -1)
	a.editCaretSet = true
	a.editCaretTarget = caret
	a.editPlaceCaret = false
	a.editSelStart, a.editSelEnd = caret, caret
	a.invalidate()
}

func (a *App) wrapEdit(start, end int, marker string) {
	src := []rune(a.editSource)
	if start < 0 || end < start || end > len(src) {
		return
	}
	selected := string(src[start:end])
	next := string(src[:start]) + marker + selected + marker + string(src[end:])
	a.editSource = next
	a.editBefore = next
	a.applyBlockEdit()
	caret := start + len(marker) + len([]rune(selected))
	a.editCaretSet = true
	a.editCaretTarget = caret
	a.editPlaceCaret = false
	a.editSelStart, a.editSelEnd = caret, caret
	a.invalidate()
}

// applyEditSource writes the editor value back, keeping a selection for the
// next frame (used by link/heading/indent shortcuts and auto-pair).
func (a *App) applyEditSource(next string, selStart, selEnd int) {
	a.editSource = next
	a.editBefore = next
	a.applyBlockEdit()
	a.editCaretSet = true
	a.editCaretTarget = selStart
	a.editSelectEnd = selEnd
	a.editSelStart, a.editSelEnd = selStart, selEnd
	a.editPlaceCaret = false
	a.invalidate()
}

func (a *App) setHeading(level int) {
	src := []rune(a.editSource)
	i := 0
	for i < len(src) && src[i] == '#' {
		i++
	}
	prefixLen := 0
	if i > 0 && i < len(src) && src[i] == ' ' {
		prefixLen = i + 1
	}
	content := string(src[prefixLen:])
	prefix := ""
	if level > 0 {
		prefix = strings.Repeat("#", level) + " "
	}
	a.applyEditSource(prefix+content, len([]rune(prefix)), len([]rune(prefix)))
}

func (a *App) insertLink(start, end int) {
	src := []rune(a.editSource)
	if start < 0 || end < start || end > len(src) {
		return
	}
	selected := string(src[start:end])
	label := "[" + selected + "]"
	url := "https://"
	next := string(src[:start]) + label + "(" + url + ")" + string(src[end:])
	urlStart := start + len([]rune(label)) + 1
	a.applyEditSource(next, urlStart, urlStart+len([]rune(url)))
}

// The link URL popover edits the run in the rich editor directly: runs
// carry the link target and r.markdown() serializes it back to source.

// editLinkAtCaret opens the URL popover when the rich caret sits inside a
// link run. It reports whether a link was found.
func (a *App) editLinkAtCaret() bool {
	if a.rich == nil {
		return false
	}
	off := 0
	for i, run := range a.rich.runs {
		n := len([]rune(run.Text))
		if run.Link != "" && a.rich.caret >= off && a.rich.caret <= off+n {
			a.linkPopURL = run.Link
			a.linkPopLabel = run.Text
			a.linkPopRun = i
			a.linkPopOpen = true
			a.invalidate()
			return true
		}
		off += n
	}
	return false
}

// applyLinkPop writes the edited URL back into the link run.
func (a *App) applyLinkPop() {
	if !a.linkPopOpen || a.rich == nil || a.linkPopRun < 0 || a.linkPopRun >= len(a.rich.runs) {
		a.linkPopOpen = false
		return
	}
	url := strings.TrimSpace(a.linkPopURL)
	if url == "" || strings.ContainsAny(url, ")\n") {
		a.notice("链接 URL 不能为空或包含括号")
		a.linkPopOpen = false
		return
	}
	if a.rich.runs[a.linkPopRun].Link == url {
		a.linkPopOpen = false
		return
	}
	a.rich.runs[a.linkPopRun].Link = url
	a.linkPopRun = -1
	a.linkPopOpen = false
	a.richDirty()
	a.invalidate()
}

// linkPopover renders the URL editor over the document (renameDialog style).
func (a *App) linkPopover(c *ui.Context) {
	t := c.Theme()
	ui.Modal(c, &a.linkPopOpen, func() {
		ui.Column(c).Width(460).Gap(12).Padding(18).Radius(12).
			Background(t.Background).Border(1, t.Border).
			Shadow(0, 18, 50, 0, ui.RGBA(0, 0, 0, 0.22)).Children(func() {
			ui.Text(c, "编辑链接").FontSize(14).FontWeight(600)
			ui.Text(c, a.linkPopLabel).FontSize(12).TextColor(t.TextMuted).
				SingleLine().Ellipsis("…")
			input := ui.TextInput(c, &a.linkPopURL).AutoFocus().Label("URL")
			ui.Row(c).Gap(8).Justify(ui.End).Children(func() {
				if ui.Button(c, "取消").Clicked() {
					a.linkPopOpen = false
					a.invalidate()
				}
				if ui.PrimaryButton(c, "确定").Clicked() || input.Submitted() {
					a.applyLinkPop()
				}
			})
		})
	})
}

func (a *App) indentEdit(start, end int, outdent bool) {
	src := []rune(a.editSource)
	if start < 0 || end < start || end > len(src) {
		return
	}
	lineStart := start
	for lineStart > 0 && src[lineStart-1] != '\n' {
		lineStart--
	}
	delta := 0
	var next []rune
	if outdent {
		remove := 0
		if lineStart < len(src) && src[lineStart] == '\t' {
			remove = 1
		} else {
			for remove < 2 && lineStart+remove < len(src) && src[lineStart+remove] == ' ' {
				remove++
			}
		}
		if remove == 0 {
			return
		}
		next = append(append([]rune{}, src[:lineStart]...), src[lineStart+remove:]...)
		delta = -remove
	} else {
		next = append(append([]rune{}, src[:lineStart]...), append([]rune{' ', ' '}, src[lineStart:]...)...)
		delta = 2
	}
	ns := max(0, start+delta)
	ne := max(0, end+delta)
	if ns > lineStart+delta {
		// keep within line
	}
	a.applyEditSource(string(next), ns, ne)
}

func (a *App) extendSelectionUp() bool {
	if a.editing <= 0 {
		return false
	}
	if a.editSelStart != a.editSelEnd || a.editSelStart > 0 {
		return false
	}
	a.applyBlockEdit()
	if a.editing <= 0 {
		return false
	}
	idx := a.editing
	prev := a.blocks[idx-1]
	current := a.blocks[idx]
	before := a.editSource
	merged := prev.Source + "\n\n" + before
	a.editSource = merged
	a.editStart = prev.Start
	a.editEnd = current.End
	a.blocks = append(a.blocks[:idx], a.blocks[idx+1:]...)
	a.editing = idx - 1
	a.applyBlockEdit()
	a.editCaretSet = true
	a.editCaretTarget = 0
	a.editSelectEnd = len([]rune(prev.Source))
	a.editSelStart = 0
	a.editSelEnd = a.editSelectEnd
	a.editPlaceCaret = false
	a.invalidate()
	return true
}

func (a *App) extendSelectionDown() bool {
	if a.editing < 0 || a.editing+1 >= len(a.blocks) {
		return false
	}
	if a.editSelStart != a.editSelEnd || a.editSelEnd < len([]rune(a.editSource)) {
		return false
	}
	a.applyBlockEdit()
	if a.editing+1 >= len(a.blocks) {
		return false
	}
	next := a.blocks[a.editing+1]
	before := a.editSource
	merged := before + "\n\n" + next.Source
	a.editSource = merged
	a.editEnd = next.End
	a.blocks = append(a.blocks[:a.editing+1], a.blocks[a.editing+2:]...)
	a.applyBlockEdit()
	a.editCaretSet = true
	a.editCaretTarget = len([]rune(before))
	a.editSelectEnd = len([]rune(merged))
	a.editSelStart = a.editCaretTarget
	a.editSelEnd = a.editSelectEnd
	a.editPlaceCaret = false
	a.invalidate()
	return true
}

func (a *App) autoPair(text string) bool {
	r := []rune(text)
	if len(r) != 1 {
		return false
	}
	open := r[0]
	close, ok := map[rune]rune{
		'(': ')', '[': ']', '{': '}', '"': '"', '\'': '\'', '`': '`',
		'*': '*', '_': '_', '~': '~',
	}[open]
	if !ok {
		return false
	}
	src := []rune(a.editSource)
	start, end := a.editSelStart, a.editSelEnd
	if start < 0 || end < start || end > len(src) {
		return false
	}
	if start != end {
		selected := string(src[start:end])
		next := string(src[:start]) + string(open) + selected + string(close) + string(src[end:])
		a.applyEditSource(next, start+1, start+1+len([]rune(selected)))
		return true
	}
	if start < len(src) && src[start] == close {
		a.applyEditSource(string(src), start+1, start+1)
		return true
	}
	next := string(src[:start]) + string(open) + string(close) + string(src[start:])
	a.applyEditSource(next, start+1, start+1)
	return true
}

func (a *App) applyBlockEdit() {
	if a.editing < 0 {
		return
	}
	old := a.source
	next := a.editAffixPrefix + a.editSource + a.editAffixSuffix
	a.source = a.source[:a.editStart] + next + a.source[a.editEnd:]
	a.editEnd = a.editStart + len(next)
	a.parseDoc()
	if a.source != old {
		a.dirty = true
		a.updateTitle()
	}
}

func (a *App) commitBlock() {
	if a.editing < 0 {
		return
	}
	a.blocks = splitSource(a.source)
	a.editing = -1
	a.editSource = ""
	a.editAffixPrefix = ""
	a.editAffixSuffix = ""
	a.editWasFocus = false
	a.editBefore = ""
	a.editPasted = false
	a.editCaretSet = false
	a.parseDoc()
	a.updateTitle()
	a.invalidate()
}

func (a *App) startBlankBlock() {
	a.source = "# 无标题\n\n"
	a.refreshDoc()
	a.dirty = true
	a.updateTitle()
	a.invalidate()
}

func plainSpans(spans []mdoc.Span) string {
	var b strings.Builder
	for _, s := range spans {
		b.WriteString(s.Text)
	}
	return b.String()
}

func countText(s string) (chars, words, lines int) {
	lines = strings.Count(s, "\n") + 1
	for _, r := range s {
		if r == '\n' || r == '\r' || r == '\t' || r == ' ' {
			continue
		}
		chars++
	}
	words = len(strings.Fields(s))
	return
}

func (a *App) displayName() string {
	if a.path == "" {
		return "未命名"
	}
	return filepath.Base(a.path)
}

func (a *App) location() string {
	if a.path == "" {
		return "未保存"
	}
	rootName := func() string {
		if a.root == "" {
			return ""
		}
		return filepath.Base(a.root)
	}()
	if a.root != "" {
		if rel, err := filepath.Rel(a.root, a.path); err == nil && !strings.HasPrefix(rel, "..") {
			dir := filepath.Dir(rel)
			if dir == "." {
				return rootName
			}
			if rootName == "" {
				return dir
			}
			return filepath.Join(rootName, dir)
		}
	}
	return filepath.Dir(a.path)
}

func (a *App) openSettings() {
	a.settingsDrag = ui.Point{}
	a.settingsOpen = true
}

// panelTargetWidth 是面板收起前的目标宽度。AI 助手面板承载对话，
// 比文件、大纲这些列表宽一档。
func (a *App) panelTargetWidth() float32 {
	if a.panel == panelAI {
		return 348
	}
	return 268
}

// showPanel selects a module without ever collapsing: the rail is a view
// switch, and clicking the active icon twice used to hide the panel.
func (a *App) showPanel(v panelView) {
	a.panel = v
	a.panelWidth = a.panelTargetWidth()
	a.panelOpen = true
	a.invalidate()
}

// collapsePanel is the panel header's dedicated close control.
func (a *App) collapsePanel() {
	a.panelOpen = false
	a.invalidate()
}

func (a *App) togglePanel(v panelView) {
	if a.panelOpen && a.panel == v {
		a.panelOpen = false
	} else {
		a.panel = v
		a.panelWidth = a.panelTargetWidth()
		a.panelOpen = true
	}
	a.invalidate()
}

// canvasLeft is how far the editor card sits from the rail: 8px, plus the
// traffic lights' inset once the panel is gone (the panel normally gives
// them room). It follows the animated panel width so the card slides with
// the panel instead of jumping when panelOpen flips.
func (a *App) canvasLeft(c *ui.Context) float32 {
	left := float32(8)
	if a.panelWidth <= 0 {
		return left
	}
	openness := a.panelW / a.panelWidth
	if openness > 1 {
		openness = 1
	}
	if openness < 0 {
		openness = 0
	}
	if extra := c.TitleBar().Left - railWidth; extra > 0 {
		left += extra * (1 - openness)
	}
	return left
}

func (a *App) notice(s string) {
	a.status = s
	a.statusAt = time.Now()
	if a.win != nil {
		time.AfterFunc(3*time.Second, func() {
			if time.Since(a.statusAt) >= 3*time.Second {
				a.status = ""
				a.win.Invalidate()
			}
		})
	}
}

func (a *App) updateTitle() {
	if a.win == nil {
		return
	}
	name := a.displayName()
	if a.dirty {
		name = "● " + name
	}
	a.win.SetTitle(name + " — Muse")
}

func (a *App) invalidate() {
	if a.win != nil {
		a.win.Invalidate()
	}
}
