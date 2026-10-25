package nativeui

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"

	"muse/mdoc"
	"muse/services"
)

type aiSettings struct {
	BaseURL string `json:"baseUrl"`
	APIKey  string `json:"apiKey"`
	Model   string `json:"model"`
	System  string `json:"system,omitempty"`
}

type chatMessage struct {
	Role    string
	Content string
}

func aiConfigPath() string {
	if dir := os.Getenv("MUSE_CONFIG_DIR"); dir != "" {
		return filepath.Join(dir, "ai.json")
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = os.TempDir()
	}
	return filepath.Join(dir, "Muse", "ai.json")
}

func loadAISettings() aiSettings {
	var s aiSettings
	data, err := os.ReadFile(aiConfigPath())
	if err == nil {
		_ = json.Unmarshal(data, &s)
	}
	return s
}

func saveAISettings(s aiSettings) error {
	path := aiConfigPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func (a *App) aiConfigured() bool {
	return strings.TrimSpace(a.ai.BaseURL) != "" && strings.TrimSpace(a.ai.Model) != ""
}

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
			ui.Column(c).FillWidth().Padding(10).Gap(8).Children(func() {
				if len(a.aiMessages) == 0 {
					ui.Text(c, "问点什么，回答会流式出现在这里。").
						FontSize(11.5).TextColor(t.TextMuted).Wrap()
				}
				for _, m := range a.aiMessages {
					a.aiBubble(c, m)
				}
				if a.aiBusy {
					ui.Text(c, "思考中…").FontSize(11).TextColor(t.TextMuted)
				}
				if a.aiErr != "" {
					ui.Text(c, a.aiErr).FontSize(11).TextColor(t.Danger).Wrap()
				}
			})
		})
		a.aiComposer(c)
	})
}

func (a *App) aiBubble(c *ui.Context, m chatMessage) {
	t := c.Theme()
	bubble := ui.Column(c).FillWidth().Padding(8, 10).Radius(8)
	if m.Role == "user" {
		bubble.Background(t.Surface)
		bubble.Children(func() {
			ui.Text(c, m.Content).FontSize(12.5).TextColor(t.Text).Wrap().LineHeight(1.6)
		})
		return
	}
	bubble.Background(t.Background).Border(1, t.Border)
	bubble.Children(func() {
		if strings.TrimSpace(m.Content) == "" {
			ui.Text(c, "…").FontSize(12).TextColor(t.TextMuted)
			return
		}
		mdoc.BlocksView(c, mdoc.Parse(m.Content).Blocks, mdoc.Options{
			BodyFontSize: 12.5,
			ContentWidth: 230,
			BaseDir:      a.docDir(),
		})
		ui.Row(c).Justify(ui.End).Children(func() {
			ui.Button(c, "插入文档").OnClick(func() {
				a.insertAIContent(m.Content)
			})
		})
	})
}

func (a *App) aiComposer(c *ui.Context) {
	t := c.Theme()
	ui.Column(c).Shrink(0).Padding(8).Gap(6).
		BorderWidth(1, 0, 0, 0).BorderColor(t.Border).Children(func() {
		ui.Row(c).Gap(6).AlignItems(ui.Center).Children(func() {
			inp := ui.TextInput(c, &a.aiInput).Grow(1).Placeholder("问点什么…").
				Disabled(a.aiBusy).Submitted()
			if a.aiBusy {
				if ui.Button(c, "停止").Clicked() {
					a.abortAI()
				}
				return
			}
			if ui.PrimaryButton(c, "发送").Clicked() || inp {
				a.sendAI()
			}
		})
		ui.Row(c).AlignItems(ui.Center).Children(func() {
			ui.Text(c, a.ai.Model).FontSize(10).TextColor(t.TextMuted).Grow(1).SingleLine().Ellipsis("…")
			if ui.Button(c, "清空").Clicked() {
				a.clearAIChat()
			}
		})
	})
}

func (a *App) sendAI() {
	if a.aiBusy || !a.aiConfigured() {
		return
	}
	text := strings.TrimSpace(a.aiInput)
	if text == "" {
		return
	}
	msgs := make([]map[string]string, 0, len(a.aiMessages)+2)
	if strings.TrimSpace(a.ai.System) != "" {
		msgs = append(msgs, map[string]string{"role": "system", "content": a.ai.System})
	}
	for _, m := range a.aiMessages {
		if strings.TrimSpace(m.Content) != "" {
			msgs = append(msgs, map[string]string{"role": m.Role, "content": m.Content})
		}
	}
	msgs = append(msgs, map[string]string{"role": "user", "content": text})

	a.aiMessages = append(a.aiMessages,
		chatMessage{Role: "user", Content: text},
		chatMessage{Role: "assistant", Content: ""},
	)
	a.aiInput = ""
	a.aiErr = ""
	a.aiBusy = true
	a.aiRequestID = fmt.Sprintf("native-%d", time.Now().UnixNano())
	a.scrollAIBottom()
	a.invalidate()

	req := services.ChatStreamRequest{
		RequestID: a.aiRequestID,
		BaseURL:   a.ai.BaseURL,
		APIKey:    a.ai.APIKey,
		Body: map[string]any{
			"model":    a.ai.Model,
			"stream":   true,
			"messages": msgs,
		},
	}
	go func() {
		res := a.aiClient.ChatStreamWith(req, services.ChatSink{
			Chunk: func(raw string) {
				if text := sseText(raw); text != "" {
					mygo.RunOnMain(func() {
						a.appendAIAssistant(text)
					})
				}
			},
			Error: func(message string) {
				mygo.RunOnMain(func() {
					a.aiErr = message
					a.aiBusy = false
					a.invalidate()
				})
			},
			End: func() {
				mygo.RunOnMain(func() {
					a.aiBusy = false
					a.invalidate()
				})
			},
		})
		mygo.RunOnMain(func() {
			a.aiBusy = false
			if !res.Ok && !res.Aborted && res.Message != "" && a.aiErr == "" {
				a.aiErr = res.Message
			}
			_ = saveAIChat(a.aiMessages)
			a.invalidate()
		})
	}()
}

func (a *App) abortAI() {
	if a.aiRequestID == "" {
		return
	}
	a.aiClient.ChatAbort(struct {
		RequestID string `json:"requestId"`
	}{RequestID: a.aiRequestID})
}

func (a *App) appendAIAssistant(delta string) {
	for i := len(a.aiMessages) - 1; i >= 0; i-- {
		if a.aiMessages[i].Role == "assistant" {
			a.aiMessages[i].Content += delta
			a.scrollAIBottom()
			a.invalidate()
			return
		}
	}
}

func (a *App) scrollAIBottom() {
	a.aiScroll.Y = math.MaxFloat32
}

// sseText pulls OpenAI-style streaming deltas out of raw SSE events.
func sseText(raw string) string {
	var b strings.Builder
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" || data == "[DONE]" {
			continue
		}
		var payload struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if json.Unmarshal([]byte(data), &payload) == nil && len(payload.Choices) > 0 {
			b.WriteString(payload.Choices[0].Delta.Content)
		}
	}
	return b.String()
}

func (a *App) modelSettings(c *ui.Context) {
	t := c.Theme()
	settingsGroup(c, "", func() {
		settingsRow(c, "接口地址", "OpenAI 兼容的 Base URL，通常以 /v1 结尾。", func() {
			ui.TextInput(c, &a.ai.BaseURL).Width(250).Placeholder("https://api.openai.com/v1")
		})
		a.settingsDivider(c, true)
		settingsRow(c, "API Key", "只写入本机配置文件，不会进入文档。", func() {
			ui.TextInput(c, &a.ai.APIKey).Password().Width(250).Placeholder("sk-…")
		})
		a.settingsDivider(c, true)
		settingsRow(c, "模型", "例如 gpt-4.1、deepseek-chat 或你的网关模型名。", func() {
			if len(a.aiModels) > 0 {
				opts := make([]string, 0, len(a.aiModels))
				for _, m := range a.aiModels {
					opts = append(opts, m.ID)
				}
				ui.Combobox(c, &a.ai.Model, opts).Width(250)
			} else {
				ui.TextInput(c, &a.ai.Model).Width(250).Placeholder("gpt-4.1")
			}
		})
		if len(a.aiModels) == 0 || a.aiModelsErr != "" {
			ui.Row(c).Gap(8).AlignItems(ui.Center).Padding(0, 2).Children(func() {
				if a.aiModelsBusy {
					ui.Text(c, "获取模型中…").FontSize(11).TextColor(t.TextMuted)
				} else if ui.Button(c, "获取模型").Clicked() {
					a.fetchAIModels()
				}
				if a.aiModelsErr != "" {
					ui.Text(c, a.aiModelsErr).FontSize(10.5).TextColor(t.Danger).Wrap()
				}
			})
		}
		a.settingsDivider(c, true)
		settingsRow(c, "系统提示", "可选；每次对话都会放在最前面。", func() {
			ui.TextInput(c, &a.ai.System).Width(250).Placeholder("You are Muse…")
		})
	})
	ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
		ui.Text(c, "密钥保存在 "+aiConfigPath()).FontSize(10.5).TextColor(t.TextMuted).Grow(1).SingleLine().Ellipsis("…")
		if ui.PrimaryButton(c, "保存模型设置").Clicked() {
			if err := saveAISettings(a.ai); err != nil {
				a.notice(fmt.Sprintf("保存失败：%v", err))
			} else {
				a.notice("模型设置已保存")
			}
		}
	})
}

func aiChatPath() string {
	if dir := os.Getenv("MUSE_CONFIG_DIR"); dir != "" {
		return filepath.Join(dir, "chat.json")
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = os.TempDir()
	}
	return filepath.Join(dir, "Muse", "chat.json")
}

func loadAIChat() []chatMessage {
	data, err := os.ReadFile(aiChatPath())
	if err != nil {
		return nil
	}
	var msgs []chatMessage
	if json.Unmarshal(data, &msgs) != nil {
		return nil
	}
	if len(msgs) > 100 {
		msgs = msgs[len(msgs)-100:]
	}
	return msgs
}

func saveAIChat(msgs []chatMessage) error {
	path := aiChatPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	if len(msgs) > 100 {
		msgs = msgs[len(msgs)-100:]
	}
	data, err := json.MarshalIndent(msgs, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func (a *App) clearAIChat() {
	a.aiMessages = nil
	a.aiErr = ""
	a.aiScroll.Y = 0
	_ = saveAIChat(a.aiMessages)
	a.invalidate()
}

func (a *App) insertAIContent(text string) {
	text = strings.TrimSpace(text)
	if text == "" {
		return
	}
	if a.editing >= 0 {
		a.applyBlockEdit()
		a.commitBlock()
	}
	a.source = strings.TrimRight(a.source, "\n") + "\n\n" + text + "\n"
	a.refreshDoc()
	a.dirty = true
	a.updateTitle()
	// 画布模式：推送新文档并滚到插入的开头。
	a.pushWebDoc()
	if first := strings.SplitN(strings.TrimSpace(text), "\n", 2)[0]; first != "" {
		a.scrollToText(first)
	}
	a.notice("已插入文档")
	a.invalidate()
}

func (a *App) fetchAIModels() {
	if a.aiModelsBusy {
		return
	}
	a.aiModelsBusy = true
	a.aiModelsErr = ""
	a.invalidate()
	req := services.TestConnRequest{BaseURL: a.ai.BaseURL, APIKey: a.ai.APIKey}
	go func() {
		res := a.aiClient.ListModels(req)
		mygo.RunOnMain(func() {
			a.aiModelsBusy = false
			if res.Ok {
				a.aiModels = res.Models
				if strings.TrimSpace(a.ai.Model) == "" && len(res.Models) > 0 {
					a.ai.Model = res.Models[0].ID
				}
				if len(res.Models) == 0 {
					a.aiModelsErr = "接口没有返回模型"
				}
			} else {
				a.aiModelsErr = res.Message
			}
			a.invalidate()
		})
	}()
}
