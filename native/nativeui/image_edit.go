package nativeui

import (
	"fmt"
	"strings"

	"github.com/egoist/mygo/ui"

	"muse/mdoc"
)

type imageEditor struct {
	block int
	alt   string
	src   string
	title string
	width float32 // explicit display width in DIPs; 0 = automatic
}

func (a *App) beginImageEdit(i int) bool {
	if i < 0 || i >= len(a.blocks) {
		return false
	}
	bs := a.blocks[i].doc.Blocks
	if len(bs) != 1 || bs[0].Kind != mdoc.Image {
		return false
	}
	if a.rich != nil {
		a.commitRich()
	}
	if a.editing >= 0 {
		a.commitBlock()
	}
	if a.cellEdit != nil {
		a.commitCell(a.cellEdit, a.cellEdit.value)
	}
	a.imageEdit = &imageEditor{
		block: i,
		alt:   bs[0].Alt,
		src:   bs[0].Src,
		title: bs[0].Title,
		width: bs[0].ImgWidth,
	}
	a.editing = -1
	a.invalidate()
	return true
}

func (a *App) commitImage() {
	e := a.imageEdit
	if e == nil {
		return
	}
	if e.block < 0 || e.block >= len(a.blocks) {
		a.imageEdit = nil
		return
	}
	b := a.blocks[e.block]
	var next string
	if e.width > 0 {
		// 显式宽度无法用 Markdown 图片表达，改写为等价的 HTML img（mdoc 解析回 ImgWidth）
		next = `<img src="` + e.src + `" alt="` + e.alt + `"`
		if strings.TrimSpace(e.title) != "" {
			next += ` title="` + e.title + `"`
		}
		next += fmt.Sprintf(` width="%d">`, int(e.width))
	} else {
		next = "![" + e.alt + "](" + e.src
		if strings.TrimSpace(e.title) != "" {
			next += ` "` + e.title + `"`
		}
		next += ")"
	}
	a.imageEdit = nil
	if next != b.Source {
		a.source = a.source[:b.Start] + next + a.source[b.End:]
		a.refreshDoc()
		a.dirty = true
		a.updateTitle()
	}
	a.invalidate()
}

func (a *App) imageEditView(c *ui.Context) {
	e := a.imageEdit
	if e == nil {
		return
	}
	t := c.Theme()
	if c.Shortcut(0, ui.KeyEscape) {
		a.commitImage()
		return
	}
	ui.Column(c).FillWidth().Padding(6, 10, 6, 10).Children(func() {
		mdoc.BlocksView(c, []mdoc.Block{{
			Kind:     mdoc.Image,
			Alt:      e.alt,
			Src:      e.src,
			Title:    e.title,
			ImgWidth: e.width,
		}}, mdoc.Options{ContentWidth: 800, BaseDir: a.docDir()})
		ui.Column(c).FillWidth().Padding(8, 0, 0, 0).Gap(5).Children(func() {
			changed := false
			ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
				ui.Text(c, "替代文字").FontSize(10.5).TextColor(t.TextMuted).Width(52)
				if ui.TextInput(c, &e.alt).Grow(1).Placeholder("描述这张图片").Changed() {
					changed = true
				}
			})
			ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
				ui.Text(c, "图片地址").FontSize(10.5).TextColor(t.TextMuted).Width(52)
				if ui.TextInput(c, &e.src).Grow(1).Placeholder("相对路径或 https://…").Changed() {
					changed = true
				}
			})
			ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
				ui.Text(c, "标题").FontSize(10.5).TextColor(t.TextMuted).Width(52)
				if ui.TextInput(c, &e.title).Grow(1).Placeholder("可选").Changed() {
					changed = true
				}
			})
			ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
				ui.Text(c, "显示宽度").FontSize(10.5).TextColor(t.TextMuted).Width(52)
				if ui.Button(c, "−").Clicked() {
					if e.width <= 0 {
						e.width = 480
					}
					e.width = max(24, e.width-24)
					changed = true
				}
				label := "自动"
				if e.width > 0 {
					label = fmt.Sprintf("%d px", int(e.width))
				}
				ui.Text(c, label).FontSize(11).Width(64).TextAlign(ui.Center)
				if ui.Button(c, "+").Clicked() {
					if e.width <= 0 {
						e.width = 456
					}
					e.width = min(2000, e.width+24)
					changed = true
				}
				if ui.Button(c, "重置").Clicked() {
					e.width = 0
					changed = true
				}
			})
			if changed {
				a.dirty = true
				a.updateTitle()
			}
		})
	})
}
