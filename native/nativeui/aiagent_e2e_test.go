package nativeui

// aiagent_e2e_test.go — 用一个假的 OpenAI 兼容端点走完整个 Agent 循环：
// 思考 → 正文 → 工具调用 → 执行 → 二轮正文，验证段落、工具结果与
// 消息状态都对。

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

// sseChunk 包装一个 delta JSON 为 SSE 事件。
func sseChunk(delta string) string {
	return "data: " + delta + "\n\n"
}

// fakeOpenAI 第 1 轮：思考 + 正文 + read_document 工具调用；
// 第 2 轮：只有正文。请求体里能看到 tools 与回传的 tool 结果。
func fakeOpenAI(t *testing.T, docSource string, got *[][]byte) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Messages []map[string]any `json:"messages"`
			Tools    []map[string]any `json:"tools"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("decode body: %v", err)
			return
		}
		*got = append(*got, nil) // 占位，下面填原始内容
		raw, _ := json.Marshal(body)
		(*got)[len(*got)-1] = raw

		w.Header().Set("Content-Type", "text/event-stream")
		f := w.(http.Flusher)
		if len(body.Tools) == 0 {
			// 降级通道：不应该在测试里走到
			t.Errorf("endpoint got no tools")
		}
		round := len(*got)
		if round == 1 {
			fmt.Fprint(w, sseChunk(`{"choices":[{"delta":{"reasoning_content":"先读文档"}}]}`))
			f.Flush()
			fmt.Fprint(w, sseChunk(`{"choices":[{"delta":{"content":"我先看看文档。"}}]}`))
			f.Flush()
			fmt.Fprint(w, sseChunk(`{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"read_document","arguments":"{}"}}]}}]}`))
			f.Flush()
			fmt.Fprint(w, sseChunk(`{"choices":[{"delta":{},"finish_reason":"tool_calls"}]}`))
			f.Flush()
			fmt.Fprint(w, "data: [DONE]\n\n")
			f.Flush()
			return
		}
		fmt.Fprint(w, sseChunk(`{"choices":[{"delta":{"content":"文档读完了，这是一篇测试文档。"}}]}`))
		f.Flush()
		fmt.Fprint(w, "data: [DONE]\n\n")
		f.Flush()
	})
}

func TestAgentLoopEndToEnd(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("MUSE_CONFIG_DIR", dir)

	var got [][]byte
	doc := "# 测试文档\n\nAgent 循环测试。\n"
	srv := httptest.NewServer(fakeOpenAI(t, doc, &got))
	defer srv.Close()

	a := New()
	a.root = dir
	docPath := dir + "/notes.md"
	if err := os.WriteFile(docPath, []byte(doc), 0o644); err != nil {
		t.Fatal(err)
	}
	a.path = docPath
	a.source = doc
	a.refreshDoc()
	a.ai = aiSettings{BaseURL: srv.URL, APIKey: "k", Model: "m"}
	a.aiInput = "总结一下这篇文档"
	a.sendAI()

	deadline := time.Now().Add(5 * time.Second)
	for a.aiBusy && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if a.aiBusy {
		t.Fatal("agent loop did not finish in time")
	}
	if a.aiErr != "" {
		t.Fatalf("unexpected error: %q", a.aiErr)
	}

	// 两条请求：第一轮带 tools，第二轮带工具结果。
	if len(got) != 2 {
		t.Fatalf("requests = %d, want 2", len(got))
	}
	var first struct {
		Messages []map[string]any `json:"messages"`
		Tools    []map[string]any `json:"tools"`
	}
	if err := json.Unmarshal(got[0], &first); err != nil {
		t.Fatal(err)
	}
	if len(first.Tools) == 0 {
		t.Fatal("first request should carry tools")
	}
	var second struct {
		Messages []map[string]any `json:"messages"`
	}
	if err := json.Unmarshal(got[1], &second); err != nil {
		t.Fatal(err)
	}
	roles := make([]string, 0, len(second.Messages))
	toolContent := ""
	for _, m := range second.Messages {
		role, _ := m["role"].(string)
		roles = append(roles, role)
		if role == "tool" {
			toolContent, _ = m["content"].(string)
		}
	}
	want := "system,system,user,assistant,tool"
	if strings.Join(roles, ",") != want {
		t.Fatalf("second round roles = %v", roles)
	}
	if !strings.Contains(toolContent, "测试文档") {
		t.Fatalf("tool result missing doc content: %q", toolContent)
	}

	// 界面消息：1 用户 + 2 助手；第一轮有思考、正文与已完成的工具段。
	if len(a.aiMessages) != 3 {
		t.Fatalf("messages = %d", len(a.aiMessages))
	}
	turn1 := a.aiMessages[1]
	if len(turn1.Parts) < 3 {
		t.Fatalf("turn1 parts = %+v", turn1.Parts)
	}
	if turn1.Parts[0].Kind != partThink || turn1.Parts[0].Text != "先读文档" {
		t.Fatalf("think part = %+v", turn1.Parts[0])
	}
	if turn1.Parts[0].Ms < 0 {
		t.Fatalf("think duration missing")
	}
	tool := turn1.Parts[2].Tool
	if tool == nil || tool.Name != "read_document" || tool.State != toolDone {
		t.Fatalf("tool part = %+v", turn1.Parts[2])
	}
	if !strings.Contains(tool.Result, "Agent 循环测试") {
		t.Fatalf("tool result = %q", tool.Result)
	}
	if got := a.aiMessages[2].textContent(); got != "文档读完了，这是一篇测试文档。" {
		t.Fatalf("turn2 text = %q", got)
	}
}

// TestAgentLoopDegradesWithoutTools 端点不认 tools 时退回纯对话。
func TestAgentLoopDegradesWithoutTools(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("MUSE_CONFIG_DIR", dir)

	var sawTools []bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Tools []map[string]any `json:"tools"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		sawTools = append(sawTools, len(body.Tools) > 0)
		if len(body.Tools) > 0 {
			http.Error(w, `{"error":{"message":"server does not support tools"}}`, http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, sseChunk(`{"choices":[{"delta":{"content":"好的。"}}]}`))
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer srv.Close()

	a := New()
	a.ai = aiSettings{BaseURL: srv.URL, Model: "m"}
	a.aiInput = "在吗"
	a.sendAI()

	deadline := time.Now().Add(5 * time.Second)
	for a.aiBusy && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if a.aiBusy {
		t.Fatal("agent loop did not finish in time")
	}
	if a.aiErr != "" {
		t.Fatalf("unexpected error: %q", a.aiErr)
	}
	if len(sawTools) != 2 || !sawTools[0] || sawTools[1] {
		t.Fatalf("tool attempts = %v", sawTools)
	}
	if !a.aiToolsUnsupported {
		t.Fatal("degrade flag not set")
	}
	if got := a.aiMessages[1].textContent(); got != "好的。" {
		t.Fatalf("answer = %q", got)
	}
}
