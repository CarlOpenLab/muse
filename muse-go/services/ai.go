// AI 服务：对应 Electron 版 electron/services/ai.ts。
// 密钥只进 Go 进程网络层，不暴露给渲染进程。
//
//	AI.TestConnection  请求 { baseUrl, apiKey } -> { ok, status?, message }
//	AI.ChatStream      发起 OpenAI 兼容流式对话，SSE 块经事件转发给渲染进程
//	AI.ChatAbort       中止指定 requestId 的上游请求
//	AI.WebSearch       Brave Search API 联网搜索 -> { ok, results?, message? }
//
// 事件（Go -> 渲染进程）：ai:chat-chunk / ai:chat-end / ai:chat-error
package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

const aiTimeout = 10 * time.Second

// TestConnResult 是连接测试的返回。
type TestConnResult struct {
	Ok      bool   `json:"ok"`
	Status  int    `json:"status,omitempty"`
	Message string `json:"message"`
}

// TestConnRequest 是连接测试的请求。
type TestConnRequest struct {
	BaseURL string `json:"baseUrl"`
	APIKey  string `json:"apiKey"`
}

// ChatStreamRequest 是流式对话的请求。
type ChatStreamRequest struct {
	RequestID string         `json:"requestId"`
	BaseURL   string         `json:"baseUrl"`
	APIKey    string         `json:"apiKey"`
	Body      map[string]any `json:"body"`
}

// ChatResult 是流式对话的最终返回（块经事件先行转发）。
type ChatResult struct {
	Ok      bool   `json:"ok"`
	Aborted bool   `json:"aborted,omitempty"`
	Message string `json:"message,omitempty"`
}

// WebSearchItem 是一条搜索结果。
type WebSearchItem struct {
	Title       string `json:"title"`
	URL         string `json:"url"`
	Description string `json:"description"`
}

// WebSearchResponse 是联网搜索的返回。
type WebSearchResponse struct {
	Ok      bool            `json:"ok"`
	Results []WebSearchItem `json:"results,omitempty"`
	Status  int             `json:"status,omitempty"`
	Message string          `json:"message,omitempty"`
}

// AI 是 AI 服务对象。
type AI struct {
	mu       sync.Mutex
	aborters map[string]context.CancelFunc
	client   *http.Client
}

// NewAI 初始化 AI 服务。
func NewAI() *AI {
	return &AI{aborters: map[string]context.CancelFunc{}, client: &http.Client{}}
}

func normalizeBaseURL(raw string) string {
	return strings.TrimRight(strings.TrimSpace(raw), "/")
}

func describeHTTPError(status int, raw string) string {
	if status == 401 || status == 403 {
		return "认证失败，请检查 API Key"
	}
	var parsed struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal([]byte(raw), &parsed) == nil && parsed.Error.Message != "" {
		return parsed.Error.Message
	}
	return fmt.Sprintf("请求失败（HTTP %d）", status)
}

func describeNetworkError(err error) string {
	if errors.Is(err, context.DeadlineExceeded) || osIsTimeout(err) {
		return fmt.Sprintf("请求超时（%ds）", int(aiTimeout/time.Second))
	}
	var uerr *url.Error
	if errors.As(err, &uerr) && uerr.Err != nil {
		err = uerr.Err
	}
	msg := err.Error()
	for _, code := range []string{"ENOTFOUND", "ECONNREFUSED", "EHOSTUNREACH", "ECONNRESET", "ETIMEDOUT",
		"no such host", "connection refused", "network is unreachable"} {
		if strings.Contains(msg, code) {
			return "无法连接服务器，请检查 Base URL"
		}
	}
	return msg
}

func osIsTimeout(err error) bool {
	var uerr *url.Error
	if errors.As(err, &uerr) {
		return uerr.Timeout()
	}
	return false
}

// TestConnection 测试与 OpenAI 兼容端点的连通性。
func (a *AI) TestConnection(req TestConnRequest) TestConnResult {
	baseURL := normalizeBaseURL(req.BaseURL)
	apiKey := strings.TrimSpace(req.APIKey)
	if baseURL == "" {
		return TestConnResult{Ok: false, Message: "请先填写 Base URL"}
	}

	ctx, cancel := context.WithTimeout(context.Background(), aiTimeout)
	defer cancel()
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/models", nil)
	if err != nil {
		return TestConnResult{Ok: false, Message: err.Error()}
	}
	if apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	}
	res, err := a.client.Do(httpReq)
	if err != nil {
		return TestConnResult{Ok: false, Message: describeNetworkError(err)}
	}
	defer res.Body.Close()

	if res.StatusCode >= 200 && res.StatusCode < 300 {
		body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		var data struct {
			Data []any `json:"data"`
		}
		if json.Unmarshal(body, &data) == nil && data.Data != nil {
			return TestConnResult{Ok: true, Status: res.StatusCode, Message: fmt.Sprintf("联通成功，发现 %d 个模型", len(data.Data))}
		}
		return TestConnResult{Ok: true, Status: res.StatusCode, Message: "联通成功"}
	}
	if res.StatusCode == 401 || res.StatusCode == 403 {
		return TestConnResult{Ok: false, Status: res.StatusCode, Message: "认证失败，请检查 API Key"}
	}
	return TestConnResult{Ok: false, Status: res.StatusCode, Message: fmt.Sprintf("请求失败（HTTP %d）", res.StatusCode)}
}

// ChatStream 发起流式对话：POST {baseUrl}/chat/completions（stream: true），
// 按 SSE 事件边界（\n\n）切块后经 ai:chat-chunk 转发；渲染进程负责拼回流。
// 方法与 Electron 版语义一致：调用在整个流结束后才返回。
func (a *AI) ChatStream(req ChatStreamRequest) ChatResult {
	requestID := req.RequestID
	baseURL := normalizeBaseURL(req.BaseURL)
	apiKey := strings.TrimSpace(req.APIKey)
	if requestID == "" || baseURL == "" || req.Body == nil {
		return ChatResult{Ok: false, Message: "请求参数不完整"}
	}

	payload, err := json.Marshal(req.Body)
	if err != nil {
		return ChatResult{Ok: false, Message: err.Error()}
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.mu.Lock()
	a.aborters[requestID] = cancel
	a.mu.Unlock()
	defer func() {
		cancel()
		a.mu.Lock()
		delete(a.aborters, requestID)
		a.mu.Unlock()
	}()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return ChatResult{Ok: false, Message: err.Error()}
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	}

	res, err := a.client.Do(httpReq)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return ChatResult{Ok: false, Aborted: true, Message: "已中止"}
		}
		message := describeNetworkError(err)
		_ = EvChatError.Broadcast(map[string]any{"requestId": requestID, "message": message})
		return ChatResult{Ok: false, Message: message}
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		message := describeHTTPError(res.StatusCode, string(raw))
		_ = EvChatError.Broadcast(map[string]any{"requestId": requestID, "message": message})
		return ChatResult{Ok: false, Message: message}
	}

	buf := make([]byte, 32*1024)
	var acc string
	for {
		n, readErr := res.Body.Read(buf)
		if n > 0 {
			acc += string(buf[:n])
			for {
				sep := strings.Index(acc, "\n\n")
				if sep < 0 {
					break
				}
				chunk := acc[:sep+2]
				acc = acc[sep+2:]
				_ = EvChatChunk.Broadcast(map[string]any{"requestId": requestID, "chunk": chunk})
			}
		}
		if readErr != nil {
			if readErr != io.EOF && !errors.Is(readErr, context.Canceled) {
				message := describeNetworkError(readErr)
				_ = EvChatError.Broadcast(map[string]any{"requestId": requestID, "message": message})
				return ChatResult{Ok: false, Message: message}
			}
			break
		}
	}
	// 兜底：流以单个 \n 结尾等边界情况
	if strings.TrimSpace(acc) != "" {
		_ = EvChatChunk.Broadcast(map[string]any{"requestId": requestID, "chunk": acc})
	}
	if ctx.Err() != nil {
		return ChatResult{Ok: false, Aborted: true, Message: "已中止"}
	}
	_ = EvChatEnd.Broadcast(map[string]any{"requestId": requestID})
	return ChatResult{Ok: true}
}

// ChatAbort 中止指定 requestId 的上游请求。
func (a *AI) ChatAbort(req struct {
	RequestID string `json:"requestId"`
},
) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if cancel, ok := a.aborters[req.RequestID]; ok {
		cancel()
		delete(a.aborters, req.RequestID)
	}
}

// WebSearch Brave Search API 联网搜索。
func (a *AI) WebSearch(req struct {
	Query  string `json:"query"`
	APIKey string `json:"apiKey"`
	Count  int    `json:"count"`
},
) WebSearchResponse {
	query := strings.TrimSpace(req.Query)
	apiKey := strings.TrimSpace(req.APIKey)
	if query == "" {
		return WebSearchResponse{Ok: false, Message: "搜索关键词不能为空"}
	}
	if apiKey == "" {
		return WebSearchResponse{Ok: false, Message: "请先在设置中填写 Brave Search API Key"}
	}
	count := req.Count
	if count <= 0 {
		count = 6
	}

	u, _ := url.Parse("https://api.search.brave.com/res/v1/web/search")
	q := u.Query()
	q.Set("q", query)
	q.Set("count", strconv.Itoa(count))
	u.RawQuery = q.Encode()

	ctx, cancel := context.WithTimeout(context.Background(), aiTimeout)
	defer cancel()
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return WebSearchResponse{Ok: false, Message: err.Error()}
	}
	httpReq.Header.Set("X-Subscription-Token", apiKey)
	httpReq.Header.Set("Accept", "application/json")

	res, err := a.client.Do(httpReq)
	if err != nil {
		return WebSearchResponse{Ok: false, Message: describeNetworkError(err)}
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		message := fmt.Sprintf("搜索失败（HTTP %d）", res.StatusCode)
		if res.StatusCode == 401 || res.StatusCode == 403 {
			message = "搜索 API Key 无效或已过期"
		}
		return WebSearchResponse{Ok: false, Status: res.StatusCode, Message: message}
	}

	body, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	var data struct {
		Web struct {
			Results []struct {
				Title       string `json:"title"`
				URL         string `json:"url"`
				Description string `json:"description"`
			} `json:"results"`
		} `json:"web"`
	}
	if json.Unmarshal(body, &data) != nil {
		return WebSearchResponse{Ok: true}
	}
	out := WebSearchResponse{Ok: true}
	for _, r := range data.Web.Results {
		out.Results = append(out.Results, WebSearchItem{Title: r.Title, URL: r.URL, Description: r.Description})
	}
	return out
}
