package nativeui

import (
	"path/filepath"
	"sort"
	"strings"

	"github.com/egoist/mygo/ui"
)

// Quick open: ⌘O opens a fuzzy file jump inside the workspace (Obsidian's
// quick switcher). Type to filter by subsequence match on the path, ↑↓ to
// move, Enter to open, Esc to dismiss; clicking a row opens it too.

func (a *App) quickOpenCandidates() []fileRow {
	rows := a.fileRows()
	files := make([]fileRow, 0, len(rows))
	for _, r := range rows {
		if !r.dir {
			files = append(files, r)
		}
	}
	q := strings.ToLower(strings.TrimSpace(a.quickOpenValue))
	if q == "" {
		sort.Slice(files, func(i, j int) bool { return files[i].path < files[j].path })
		return files
	}
	type scored struct {
		row   fileRow
		score int
	}
	matches := make([]scored, 0, 16)
	for _, r := range files {
		// 相对路径参与匹配：绝对路径会把用户主目录/临时目录里的字符
		// 也算成命中。
		rel := strings.TrimPrefix(r.path, a.root)
		if s := fuzzyScore(strings.ToLower(rel), q); s >= 0 {
			matches = append(matches, scored{r, s})
		}
	}
	sort.Slice(matches, func(i, j int) bool {
		if matches[i].score != matches[j].score {
			return matches[i].score < matches[j].score
		}
		return matches[i].row.path < matches[j].row.path
	})
	out := make([]fileRow, len(matches))
	for i, m := range matches {
		out[i] = m.row
	}
	return out
}

// fuzzyScore returns >=0 when needle is a subsequence of hay; lower is
// better (consecutive and word-start hits rank first).
func fuzzyScore(hay, needle string) int {
	score, at := 0, 0
	for i := 0; i < len(needle); i++ {
		found := -1
		for j := at; j < len(hay); j++ {
			if hay[j] == needle[i] {
				found = j
				break
			}
		}
		if found < 0 {
			return -1
		}
		if found == at && i > 0 {
			score -= 2 // consecutive
		}
		if found == 0 || hay[found-1] == '/' {
			score -= 3 // after a path separator
		}
		score += found - at
		at = found + 1
	}
	return score
}

// openQuickOpen shows the palette, or the system file dialog when no
// workspace is open.
func (a *App) openQuickOpen() {
	if a.root == "" {
		a.openFileDialog()
		return
	}
	a.quickOpen = true
	a.quickOpenValue = ""
	a.quickOpenSel = 0
	a.invalidate()
}

func (a *App) closeQuickOpen() {
	a.quickOpen = false
	a.invalidate()
}

// applyQuickOpen opens the selected candidate.
func (a *App) applyQuickOpen() {
	cands := a.quickOpenCandidates()
	if len(cands) == 0 {
		a.closeQuickOpen()
		return
	}
	if a.quickOpenSel >= len(cands) {
		a.quickOpenSel = 0
	}
	path := cands[a.quickOpenSel].path
	a.quickOpen = false
	a.selectedPath = path
	a.requestOpen(path)
	a.invalidate()
}

func (a *App) quickOpenDialog(c *ui.Context) {
	if !a.quickOpen {
		return
	}
	if c.Shortcut(0, ui.KeyEscape) {
		a.closeQuickOpen()
		return
	}
	if c.Shortcut(0, ui.KeyUp) {
		if a.quickOpenSel > 0 {
			a.quickOpenSel--
		}
	}
	if c.Shortcut(0, ui.KeyDown) {
		if a.quickOpenSel < len(a.quickOpenCandidates())-1 {
			a.quickOpenSel++
		}
	}
	t := c.Theme()
	ui.Box(c).Fill().Background(ui.RGBA(0, 0, 0, 0.32)).Children(func() {
		ui.Column(c).Width(560).Margin(110, ui.Auto, 0, ui.Auto).Radius(12).
			Background(t.Background).Border(1, t.Border).
			Shadow(0, 12, 32, -6, ui.RGBA(0, 0, 0, 0.28)).
			Padding(10).Gap(8).Children(func() {
			ui.TextInput(c, &a.quickOpenValue).Placeholder("跳转到文件…").Label("跳转文件").
				AutoFocus().OnSubmit(func() { a.applyQuickOpen() })
			cands := a.quickOpenCandidates()
			if len(cands) == 0 {
				ui.Text(c, "没有匹配的文件").FontSize(12).TextColor(t.TextMuted).SingleLine().Ellipsis("…")
				return
			}
			if a.quickOpenSel >= len(cands) {
				a.quickOpenSel = len(cands) - 1
			}
			if a.quickOpenSel < 0 {
				a.quickOpenSel = 0
			}
			n := len(cands)
			if n > 12 {
				n = 12
			}
			for i := 0; i < n; i++ {
				r := cands[i]
				i := i
				row := ui.Row(c).Height(30).Radius(6).Padding(0, 10).Gap(7).
					AlignItems(ui.Center).Cursor(ui.CursorPointer)
				switch {
				case i == a.quickOpenSel:
					if t.Dark {
						row.Background(ui.RGBA(107, 147, 255, 0.30))
					} else {
						row.Background(ui.RGBA(107, 147, 255, 0.20))
					}
				case row.Hovered():
					row.Background(t.SurfaceHover)
				}
				row.Children(func() {
					ui.Icon(c, iconFile).Size(13, 13).TextColor(t.TextMuted)
					ui.Text(c, filepath.Base(r.path)).FontSize(12.5).TextColor(t.Text).
						SingleLine().Ellipsis("…")
					dir := filepath.Dir(strings.TrimPrefix(r.path, a.root))
					if dir != "" && dir != "." {
						ui.Spacer(c)
						ui.Text(c, strings.Trim(dir, "/")).FontSize(10.5).TextColor(t.TextMuted).
							SingleLine().Ellipsis("…")
					}
				})
				row.OnClick(func() {
					a.quickOpenSel = i
					a.applyQuickOpen()
				})
			}
			ui.Row(c).Height(18).Padding(0, 2).Children(func() {
				ui.Textf(c, "%d 个文件 · ↑↓ 选择 · ↵ 打开 · Esc 关闭", len(cands)).
					FontSize(10).TextColor(t.TextMuted)
			})
		})
	})
}
