package nativeui

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/egoist/mygo/ui"
)

// Markdown names are shown and edited without their extension. Keep the
// original spelling of the extension when renaming, including .MD.
func markdownExtension(path string) string {
	ext := filepath.Ext(path)
	switch strings.ToLower(ext) {
	case ".md", ".markdown", ".mdx":
		return ext
	}
	return ""
}

func (a *App) documentNameButton(c *ui.Context) {
	t := c.Theme()
	name := strings.TrimSuffix(a.displayName(), markdownExtension(a.path))
	label, tip := "重命名当前文档", "点击重命名"
	if a.path == "" {
		label, tip = "命名并保存文档", "点击命名并保存"
	}
	b := ui.ButtonBase(c).Height(28).MaxWidth(280).Shrink(1).Padding(0, 6).Margin(0, 0, 0, -6).
		Radius(6).Cursor(ui.CursorPointer).Label(label).Tooltip(tip)
	switch {
	case b.Pressed():
		b.Background(t.SurfacePressed)
	case b.Hovered():
		b.Background(t.SurfaceHover)
	}
	b.Children(func() {
		ui.Text(c, name).FontSize(13).FontWeight(600).SingleLine().Ellipsis("…")
	})
	b.OnClick(a.renameCurrentDocument)
}

func (a *App) renameCurrentDocument() {
	if a.path == "" {
		a.saveAs()
		return
	}
	a.beginRename(a.path)
}

func (a *App) beginRename(path string) {
	a.renamePath = path
	a.renameExt = ""
	if st, err := os.Stat(path); err == nil && !st.IsDir() {
		a.renameExt = markdownExtension(path)
	}
	a.renameValue = strings.TrimSuffix(filepath.Base(path), a.renameExt)
	a.renameError = ""
	a.renameOpen = true
	a.invalidate()
}

func (a *App) renameDialog(c *ui.Context) {
	t := c.Theme()
	ui.Modal(c, &a.renameOpen, func() {
		ui.Text(c, "重命名").FontSize(14).FontWeight(600)
		ui.Text(c, "新名称").FontSize(12).TextColor(t.TextMuted)
		input := ui.TextInput(c, &a.renameValue).AutoFocus().Label("新名称").
			Invalid(a.renameError != "")
		if input.Changed() {
			a.renameError = ""
		}
		if a.renameExt != "" {
			ui.Text(c, "自动保留 "+a.renameExt+" 扩展名").FontSize(12).TextColor(t.TextMuted)
		}
		if a.renameError != "" {
			ui.Text(c, a.renameError).FontSize(12).TextColor(t.Danger)
		}
		ui.Row(c).Gap(8).Justify(ui.End).Children(func() {
			if ui.Button(c, "取消").Clicked() {
				a.renameOpen = false
			}
			if ui.PrimaryButton(c, "重命名").Clicked() || input.Submitted() {
				a.applyRename()
			}
		})
	}).Width(420)
}

func (a *App) applyRename() {
	name := strings.TrimSpace(a.renameValue)
	if name == "" || name == "." || name == ".." ||
		strings.ContainsAny(name, `/\:*?"<>|`) || strings.ContainsFunc(name, unicode.IsControl) {
		a.renameError = "请输入有效的文件名，不要包含路径或特殊字符。"
		a.invalidate()
		return
	}
	old := a.renamePath
	if old == "" {
		return
	}
	if a.renameExt != "" {
		name = strings.TrimSuffix(name, markdownExtension(name)) + a.renameExt
	}
	newPath := filepath.Join(filepath.Dir(old), name)
	if newPath == old {
		a.renameOpen = false
		a.invalidate()
		return
	}
	// os.Rename can replace an existing file on Unix. A name conflict must
	// keep both documents and leave the dialog open for another name.
	if _, err := os.Lstat(newPath); !os.IsNotExist(err) {
		if err == nil {
			a.renameError = "这个名称已存在，请换一个名称。"
		} else {
			a.renameError = fmt.Sprintf("无法使用这个名称：%v", err)
		}
		a.invalidate()
		return
	}
	if err := os.Rename(old, newPath); err != nil {
		a.renameError = fmt.Sprintf("重命名失败：%v", err)
		a.invalidate()
		return
	}
	a.followRenamedPath(old, newPath)
	a.renameOpen = false
	a.renamePath = ""
	a.renameError = ""
	a.clearTreeCache()
	a.notice("已重命名")
	a.updateTitle()
	a.invalidate()
}

// The same dialog serves the file tree, so a renamed folder also updates
// any open document and recent entries inside it. The editor buffer and
// its undo history are left intact.
func (a *App) followRenamedPath(old, next string) {
	remap := func(path string) string {
		if path == "" {
			return path
		}
		rel, err := filepath.Rel(old, path)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return path
		}
		return filepath.Join(next, rel)
	}
	a.path = remap(a.path)
	a.selectedPath = remap(a.selectedPath)
	a.root = remap(a.root)
	for path, open := range a.expanded {
		if newPath := remap(path); newPath != path {
			delete(a.expanded, path)
			a.expanded[newPath] = open
		}
	}
	for i := range a.recents {
		a.recents[i].Path = remap(a.recents[i].Path)
	}
	_ = saveRecents(a.recents)
}
