package nativeui

// aichat.go — AI 助手面板的界面：左右分列的对话、思考与工具调用的
// 流式渲染（参考 Codex 的呈现），以及底部常驻的输入区。
//
// 布局：用户消息靠右、着色气泡；助手内容靠左、按段展开——思考是
// 可折叠的摘要行，工具调用是带状态的行卡，正文用 mdoc 流式渲染。

import (
	"bytes"
	"encoding/json"
	"fmt"
	"runtime"
	"strings"

	"github.com/egoist/mygo/ui"

	"muse/mdoc"
)

func (a *App) aiView(c *ui.Context) {
	t := c.Theme()
	if !a.aiConfigured() {
		ui.Column(c).Fill().Center().Gap(10).Padding(20).Children(func() {
			ui.Icon(c, iconAI).Size(28, 28).TextColor(t.TextMuted)
			ui.Text(c, "先设置模型").FontSize(13).FontWeight(600)
			ui.Text(c, "Muse 使用 OpenAI 兼容的接口，密钥只保存在本机。").
				FontSize(11.5).TextColor(t.TextMuted).Wrap().TextAlign(ui.Center)
			ui.Button(c, "设置模型").OnClick(func() {
				a.settingsOpen = true
				a.settingsTab = 2
			})
		})
		return
	}

	ui.Column(c).Fill().Children(func() {
		ui.Scroll(c).Grow(1).TrackScroll(&a.aiScroll).Children(func() {
			ui.Column(c).FillWidth().Padding(10, 12, 12, 12).Gap(12).Children(func() {
				if len(a.aiMessages) == 0 {
					a.aiEmpty(c)
					return
				}
				for mi := range a.aiMessages {
					a.aiMessage(c, mi)
				}
				if a.aiBusy {
					a.aiBusyRow(c)
				}
				if a.aiErr != "" {
					a.aiErrorRow(c)
				}
			})
		})
		a.aiComposer(c)
	})
}

// aiEmpty 是没有对话时的空态：说明 Agent 能做什么，并给出示例。
func (a *App) aiEmpty(c *ui.Context) {
	t := c.Theme()
	ui.Column(c).FillWidth().Padding(24, 0, 8, 0).Gap(8).AlignItems(ui.Center).Children(func() {
		ui.Icon(c, iconAI).Size(26, 26).TextColor(t.TextMuted)
		ui.Text(c, "问问 Muse 的 Agent").FontSize(13).FontWeight(600)
		ui.Text(c, "它可以浏览、搜索和编辑工作区里的文档。").
			FontSize(11.5).TextColor(t.TextMuted).Wrap().TextAlign(ui.Center)
		ui.Box(c).Height(6)
		ui.Row(c).Gap(6).Children(func() {
			a.aiSuggestion(c, "总结这篇文档")
			a.aiSuggestion(c, "改得更正式")
			a.aiSuggestion(c, "起 5 个标题")
		})
	})
}

// aiSuggestion 是一枚示例气泡，点一下把问题填进输入框。
func (a *App) aiSuggestion(c *ui.Context, text string) {
	t := c.Theme()
	b := ui.ButtonBase(c).Height(24).Padding(0, 10).Radius(12).Label(text).
		AlignItems(ui.Center).Description(text)
	b.Background(t.Background).Border(1, t.Border)
	if b.Hovered() {
		b.Background(t.SurfaceHover)
	}
	b.OnClick(func() {
		if a.aiBusy {
			return
		}
		a.aiInput = text
		a.invalidate()
	})
	b.Children(func() {
		ui.Text(c, text).FontSize(11).TextColor(t.TextMuted).SingleLine()
	})
}

// aiMessage 渲染一条消息：用户靠右，助手靠左。mi 指向 a.aiMessages
// 里的消息，折叠状态直接改在存储的数据上。
func (a *App) aiMessage(c *ui.Context, mi int) {
	m := &a.aiMessages[mi]
	if m.Role == "user" {
		a.aiUserBubble(c, m.Content)
		return
	}
	a.aiAgentBlock(c, m)
}

// aiUserBubble 是靠右的用户气泡，浅浅染一层主题色。
func (a *App) aiUserBubble(c *ui.Context, text string) {
	t := c.Theme()
	ui.Row(c).FillWidth().Justify(ui.End).Children(func() {
		bubble := ui.Column(c).MaxWidthPercent(88).Padding(7, 11).
			Radius(14, 14, 4, 14)
		if t.Dark {
			bubble.Background(t.Accent.Alpha(0.18))
		} else {
			bubble.Background(t.Accent.Alpha(0.10))
		}
		bubble.Selectable().Children(func() {
			ui.Text(c, text).FontSize(12.5).TextColor(t.Text).Wrap().LineHeight(1.55)
		})
	})
}

// aiAgentBlock 是靠左的助手回复：思考、工具、正文各一段。
func (a *App) aiAgentBlock(c *ui.Context, m *chatMessage) {
	ui.Column(c).FillWidth().Gap(8).Children(func() {
		lastText := -1
		for i := range m.Parts {
			if m.Parts[i].Kind == partText && strings.TrimSpace(m.Parts[i].Text) != "" {
				lastText = i
			}
		}
		for i := range m.Parts {
			a.aiPart(c, m, i)
		}
		// 对话结束后，最后一段正文带插入/复制操作。
		if !a.aiBusy && lastText >= 0 {
			a.aiTextActions(c, m.Parts[lastText].Text)
		}
	})
}

// aiPart 按类型渲染一段。
func (a *App) aiPart(c *ui.Context, m *chatMessage, i int) {
	p := &m.Parts[i]
	switch p.Kind {
	case partThink:
		a.aiThinkPart(c, p)
	case partTool:
		a.aiToolPart(c, p)
	case partText:
		if strings.TrimSpace(p.Text) == "" {
			return
		}
		a.aiTextPart(c, p.Text)
	}
}

// aiThinkPart 是思考段：一行摘要，点开看过程，参考 Codex 的折叠式
// "Thought for …"。
func (a *App) aiThinkPart(c *ui.Context, p *chatPart) {
	t := c.Theme()
	thinking := p.Ms == 0 && p.open // 流式进行中
	label := "思考过程"
	switch {
	case thinking:
		label = "深度思考中…"
	case p.Ms > 0:
		label = fmt.Sprintf("已思考 %.1f 秒", float64(p.Ms)/1000)
	}
	hasBody := strings.TrimSpace(p.Text) != ""

	ui.Column(c).FillWidth().Gap(4).Children(func() {
		if !hasBody {
			ui.Row(c).Gap(5).AlignItems(ui.Center).Children(func() {
				ui.Icon(c, iconAI).Size(11, 11).TextColor(t.TextMuted)
				ui.Text(c, label).FontSize(10.5).TextColor(t.TextMuted)
			})
			return
		}
		btn := ui.ButtonBase(c).Height(20).Padding(4, 2).Radius(5).Gap(5).
			AlignItems(ui.Center).Label(label)
		if btn.Hovered() {
			btn.Background(t.SurfaceHover)
		}
		btn.OnClick(func() {
			p.open = !p.open
			a.invalidate()
		})
		btn.Children(func() {
			ui.Icon(c, iconAI).Size(11, 11).TextColor(t.TextMuted)
			ui.Text(c, label).FontSize(10.5).TextColor(t.TextMuted)
			chevron := iconChevron
			if p.open {
				chevron = iconChevronDown
			}
			ui.Icon(c, chevron).Size(10, 10).TextColor(t.TextMuted)
		})
		if p.open {
			ui.Column(c).FillWidth().Padding(2, 0, 0, 9).
				BorderWidth(0, 0, 0, 1).BorderColor(t.Border).Children(func() {
				ui.Text(c, p.Text).FontSize(10.5).Italic().TextColor(t.TextMuted).
					Wrap().LineHeight(1.55).Selectable()
			})
		}
	})
}

// aiToolPart 是一次工具调用：一行带图标与状态，点开看参数与结果。
func (a *App) aiToolPart(c *ui.Context, p *chatPart) {
	t := c.Theme()
	tool := p.Tool
	if tool == nil {
		return
	}
	label := toolLabel(tool.Name)
	target := toolTarget(tool.Args)

	open := p.open
	running := tool.State == toolRunning

	detail := ""
	if tool.Err != "" {
		detail = tool.Err
	} else if tool.Result != "" {
		detail = tool.Result
	}

	ui.Column(c).FillWidth().Gap(3).Children(func() {
		btn := ui.ButtonBase(c).Height(24).Padding(4, 7).Radius(7).Gap(6).
			FillWidth().AlignItems(ui.Center).Label(label)
		btn.Background(t.Background).Border(1, t.Border)
		if btn.Hovered() {
			btn.Background(t.SurfaceHover)
		}
		btn.OnClick(func() {
			p.open = !p.open
			a.invalidate()
		})
		btn.Children(func() {
			ui.Icon(c, toolIcon(tool.Name)).Size(12, 12).TextColor(t.TextMuted)
			ui.Text(c, label).FontSize(11).TextColor(t.Text).SingleLine()
			if target != "" {
				ui.Text(c, target).FontSize(10.5).TextColor(t.TextMuted).Grow(1).
					SingleLine().Ellipsis("…")
			} else {
				ui.Spacer(c)
			}
			switch {
			case running:
				ui.Spinner(c).TextColor(t.TextMuted)
			case tool.State == toolFailed:
				ui.Text(c, "✕").FontSize(10.5).TextColor(t.Danger)
			default:
				ui.Text(c, "✓").FontSize(10.5).TextColor(t.TextMuted)
			}
		})
		if open && detail != "" {
			body := detail
			if len(body) > 700 {
				body = body[:700] + "\n…"
			}
			ui.Column(c).FillWidth().Padding(4, 0, 0, 9).
				BorderWidth(0, 0, 0, 1).BorderColor(t.Border).Gap(3).Children(func() {
				if args := prettyJSON(tool.Args); args != "" {
					ui.Text(c, args).FontSize(10).TextColor(t.TextMuted).Wrap().LineHeight(1.45)
				}
				ui.Text(c, body).FontSize(10).TextColor(t.TextMuted).Wrap().LineHeight(1.45)
			})
		}
	})
}

// aiTextPart 是正文段：mdoc 流式渲染。
func (a *App) aiTextPart(c *ui.Context, text string) {
	mdoc.BlocksView(c, mdoc.Parse(text).Blocks, mdoc.Options{
		BodyFontSize: 12.5,
		ContentWidth: a.aiContentWidth(),
		BaseDir:      a.docDir(),
		Padding:      0,
		IndentStep:   14,
	})
}

// aiTextActions 是正文下面的操作：插入文档 / 复制。
func (a *App) aiTextActions(c *ui.Context, text string) {
	a.aiMiniButton(c, "插入文档", func() { a.insertAIContent(text) })
	a.aiMiniButton(c, "复制", func() {
		clipboardWrite(strings.TrimSpace(text))
		a.notice("已复制")
		a.invalidate()
	})
}

// aiMiniButton 是一行里的浅色小按钮。
func (a *App) aiMiniButton(c *ui.Context, label string, fn func()) {
	t := c.Theme()
	b := ui.ButtonBase(c).Height(22).Padding(0, 9).Radius(6).Label(label).
		AlignItems(ui.Center).Description(label)
	b.Background(t.Background).Border(1, t.Border)
	if b.Hovered() {
		b.Background(t.SurfaceHover)
	}
	b.OnClick(fn)
	b.Children(func() {
		ui.Text(c, label).FontSize(10.5).TextColor(t.TextMuted)
	})
}

// aiBusyRow 是流式进行中的状态行。
func (a *App) aiBusyRow(c *ui.Context) {
	t := c.Theme()
	ui.Row(c).Gap(7).AlignItems(ui.Center).Padding(0, 2).Children(func() {
		ui.Spinner(c).TextColor(t.TextMuted)
		phase := a.aiPhase
		if phase == "" {
			phase = "思考中…"
		}
		ui.Text(c, phase).FontSize(11).TextColor(t.TextMuted)
	})
}

// aiErrorRow 是错误行。
func (a *App) aiErrorRow(c *ui.Context) {
	t := c.Theme()
	ui.Row(c).Gap(6).AlignItems(ui.Center).FillWidth().Children(func() {
		ui.Text(c, a.aiErr).FontSize(11).TextColor(t.Danger).Wrap().Grow(1)
	})
}

// aiComposer 是底部的输入区：多行输入卡片 + 发送/停止 + 提示行。
func (a *App) aiComposer(c *ui.Context) {
	t := c.Theme()
	ui.Column(c).Shrink(0).Padding(2, 10, 10, 10).Children(func() {
		card := ui.Column(c).FillWidth().Radius(12).Background(t.Surface).
			Padding(6, 6, 6, 10).Gap(2)
		card.Children(func() {
			ui.Row(c).Gap(8).AlignItems(ui.End).Children(func() {
				ta := ui.TextAreaBase(c, &a.aiInput).Grow(1).
					Placeholder("让 Agent 总结、改写或编辑这篇文档…").
					Lines(1, 7).FontSize(12.5).Padding(4, 2).LineHeight(1.5)
				if ta.Shortcut(ui.Cmd, ui.KeyEnter) && !a.aiBusy {
					a.sendAI()
				}
				a.aiSendButton(c)
			})
			ui.Row(c).Gap(6).AlignItems(ui.Center).Padding(2, 4, 0, 2).Children(func() {
				ui.Textf(c, "Enter 换行 · %s 发送", sendModifierLabel()).
					FontSize(10).TextColor(t.TextMuted).Grow(1)
				if a.aiBusy {
					ui.Text(c, a.aiPhase).FontSize(10).TextColor(t.TextMuted).
						SingleLine().Ellipsis("…")
				} else {
					ui.Text(c, a.ai.Model).FontSize(10).TextColor(t.TextMuted).
						SingleLine().Ellipsis("…")
					a.aiMiniButton(c, "清空", a.clearAIChat)
				}
			})
		})
		if card.FocusWithin() {
			card.Border(1, t.Accent)
		} else {
			card.Border(1, t.Border)
		}
	})
}

// aiSendButton 是输入框右侧的圆形动作键：空闲时发送，进行中停止。
func (a *App) aiSendButton(c *ui.Context) {
	t := c.Theme()
	b := ui.ButtonBase(c).Width(28).Height(28).Radius(14).Padding(0).
		Justify(ui.Center).AlignItems(ui.Center).Label("发送").Description("发送")
	switch {
	case a.aiBusy:
		b.Label("停止").Description("停止")
		b.Background(t.SurfaceHover)
		b.OnClick(a.abortAI)
		b.Children(func() {
			ui.Icon(c, iconStop).Size(10, 10).TextColor(t.Text)
		})
	case strings.TrimSpace(a.aiInput) == "":
		b.Background(t.SurfaceHover)
		b.Children(func() {
			ui.Icon(c, iconArrowUp).Size(14, 14).TextColor(t.TextMuted)
		})
	default:
		b.Background(t.Accent)
		if b.Hovered() {
			b.Background(t.AccentHover)
		}
		b.OnClick(a.sendAI)
		b.Children(func() {
			ui.Icon(c, iconArrowUp).Size(14, 14).TextColor(t.AccentText)
		})
	}
}

// aiContentWidth 是正文渲染的栏宽：面板宽减去左右留白。
func (a *App) aiContentWidth() float32 {
	w := a.panelWidth - 28
	if w < 180 {
		return 180
	}
	return w
}

// toolTarget 从参数里挑一个给界面看的对象名（通常是文件名）。
func toolTarget(argsJSON string) string {
	var args struct {
		Path string `json:"path"`
	}
	if json.Unmarshal([]byte(argsJSON), &args) != nil || args.Path == "" {
		return ""
	}
	return baseName(args.Path)
}

// baseName 兼容 / 与 \ 的取文件名。
func baseName(p string) string {
	if i := strings.LastIndexAny(p, `/\`); i >= 0 {
		return p[i+1:]
	}
	return p
}

// prettyJSON 把工具参数缩进成可读的几行；解析失败就原样给出。
func prettyJSON(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	var indented bytes.Buffer
	if json.Indent(&indented, []byte(raw), "", "  ") != nil {
		return raw
	}
	return indented.String()
}

// sendModifierLabel 按平台显示发送快捷键。
func sendModifierLabel() string {
	if runtime.GOOS == "darwin" {
		return "⌘Enter"
	}
	return "Ctrl+Enter"
}

// scrollAIBottom 把对话滚到最底。
func (a *App) scrollAIBottom() {
	a.aiScroll.Y = 1e9
}
