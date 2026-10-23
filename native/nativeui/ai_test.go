package nativeui

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestSSETextParsesOpenAIChunks(t *testing.T) {
	raw := "data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\n" +
		"data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\n" +
		"data: [DONE]\n\n"
	if got := sseText(raw); got != "Hello" {
		t.Fatalf("sseText = %q", got)
	}
}

func TestAISettingsRoundTrip(t *testing.T) {
	dir := t.TempDir()
	old := os.Getenv("MUSE_CONFIG_DIR")
	t.Setenv("MUSE_CONFIG_DIR", dir)
	defer os.Setenv("MUSE_CONFIG_DIR", old)

	want := aiSettings{BaseURL: "https://example.test/v1", APIKey: "sk-test", Model: "m", System: "sys"}
	if err := saveAISettings(want); err != nil {
		t.Fatal(err)
	}
	if fi, err := os.Stat(filepath.Join(dir, "ai.json")); err != nil || fi.Mode().Perm() != 0o600 {
		t.Fatalf("config mode = %v, err=%v", fi, err)
	}
	got := loadAISettings()
	if got != want {
		t.Fatalf("loaded = %+v, want %+v", got, want)
	}
}

func TestAIViewShowsSetupWhenUnconfigured(t *testing.T) {
	a := New()
	a.panel = panelAI
	a.panelOpen = true
	a.ai = aiSettings{}
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if !tt.HasText("设置模型") {
		t.Fatalf("setup prompt missing; texts=%q", tt.Texts())
	}
}

func TestAIViewShowsUserMessage(t *testing.T) {
	a := New()
	a.panel = panelAI
	a.panelOpen = true
	a.ai = aiSettings{BaseURL: "https://example.test/v1", Model: "m"}
	a.aiMessages = []chatMessage{{Role: "user", Content: "hello"}}
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if !tt.HasText("hello") {
		t.Fatalf("message missing; texts=%q", tt.Texts())
	}
}

func TestAIChatPersistence(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("MUSE_CONFIG_DIR", dir)
	msgs := []chatMessage{{Role: "user", Content: "hi"}, {Role: "assistant", Content: "hello"}}
	if err := saveAIChat(msgs); err != nil {
		t.Fatal(err)
	}
	got := loadAIChat()
	if len(got) != 2 || got[1].Content != "hello" {
		t.Fatalf("chat = %+v", got)
	}
}

func TestInsertAIContentAppendsToDocument(t *testing.T) {
	a := New()
	a.source = "# 无标题\n\n旧内容\n"
	a.refreshDoc()
	a.insertAIContent("## AI 回答\n\n新段落")
	if !strings.Contains(a.source, "新段落") || !strings.Contains(a.source, "旧内容") {
		t.Fatalf("source = %q", a.source)
	}
	if !a.dirty {
		t.Fatal("document not marked dirty")
	}
}
