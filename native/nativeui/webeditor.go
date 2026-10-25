package nativeui

import (
	"fmt"
	"io/fs"
	"log"
	"os"
	"os/exec"
	"runtime"
	"time"

	"github.com/egoist/mygo"
	"muse/nativeui/web"
)

// The WebView canvas: RFC-001's target architecture, hosted by MyGo's own
// WebView element instead of a hand-rolled WKWebView. The Vue page (built
// from editor-web/, embedded below) owns the Markdown surface as a
// ProseMirror document — rendered and edited in one representation, so the
// native route's click-time height jitter cannot occur by construction.
// Files, saving, AI and all chrome stay in Go.

// bridgeMsg is one RFC-001 §5.2 protocol message on the single
// "muse:bridge" event (native → web). Fields beyond Type map per message;
// the shapes mirror editor-web/src/bridge/protocol.ts.
type bridgeMsg struct {
	Type string `json:"type"`
	Path string `json:"path,omitempty"`
	// 不能 omitempty：空字符串是合法载荷（新建空文件），丢了会让
	// 画布收到 undefined 并抛错，停留在上一个文档。
	Markdown string            `json:"markdown"`
	Revision int               `json:"revision,omitempty"`
	Theme    string            `json:"theme,omitempty"`
	Name     string            `json:"name,omitempty"`
	Text     string            `json:"text,omitempty"`
	Tokens   map[string]string `json:"tokens,omitempty"`
}

var evBridge = mygo.NewEvent[bridgeMsg]("muse:bridge")

// webBridgeService is bound to the frontend as "Muse": the Vue page calls
// these methods through window.mygo.runtime (mygo.BindAs generates the
// client). Methods run on their own goroutines; anything touching UI state
// hops through a.onMain.
type webBridgeService struct{ a *App }

func (s *webBridgeService) Ready() error {
	a := s.a
	a.onMain(func() {
		a.webReady = true
		a.pushWebDoc()
	})
	return nil
}

func (s *webBridgeService) DocumentChanged(markdown string, revision int) error {
	a := s.a
	a.onMain(func() {
		a.applyWebChanged(markdown, revision)
	})
	return nil
}

// SaveRequested delivers the fresh markdown the save flow asked for. It
// only feeds the channel — save() blocks on it from the main thread, so
// hopping to main here would deadlock until the timeout.
func (s *webBridgeService) SaveRequested(markdown string) error {
	a := s.a
	a.saveMu.Lock()
	ch := a.saveReply
	a.saveMu.Unlock()
	if ch != nil {
		select {
		case ch <- markdown:
		default:
		}
	}
	return nil
}

func (s *webBridgeService) SelectionChanged(from, to int, text string) error {
	a := s.a
	a.onMain(func() {
		a.webSel.from, a.webSel.to, a.webSel.text = from, to, text
	})
	return nil
}

func (s *webBridgeService) SelectionReply(id, from, to int, text string) error {
	return s.SelectionChanged(from, to, text)
}

func (s *webBridgeService) OpenLink(href string) error {
	go openExternal(href)
	return nil
}

func (s *webBridgeService) ImagePaste(mime, base64 string) error {
	// The canvas keeps pasted images as data URLs for now; the file-backed
	// image store arrives with the asset bridge (RFC-001 §6).
	return nil
}

func (s *webBridgeService) CommandReply(id int, ok bool, errMsg string) error {
	if !ok && errMsg != "" {
		log.Printf("web canvas command %d failed: %s", id, errMsg)
	}
	return nil
}

func openExternal(href string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", href)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", href)
	default:
		cmd = exec.Command("xdg-open", href)
	}
	if err := cmd.Run(); err != nil {
		log.Printf("open %s: %v", href, err)
	}
}

// ---------------------------------------------------------------------------
// App side

// initWebEditor creates the canvas web view for the window. Any failure
// (no web engine on this machine, MUSE_NATIVE_EDITOR=1) falls back to the
// all-native editor; a.webView stays nil and the nativeui paths run as
// before.
func (a *App) initWebEditor() {
	if os.Getenv("MUSE_NATIVE_EDITOR") == "1" {
		return
	}
	wv, err := a.win.NewWebView(mygo.WebViewOptions{
		URL:             "/",
		BackgroundColor: "light-dark(#ffffff, #1a1a1a)",
	})
	if err != nil {
		log.Printf("web editor unavailable, using the native editor: %v", err)
		return
	}
	a.webView = wv
	wv.Page().OnDOMReady(func() {
		a.onMain(func() { a.webReady = true; a.pushWebDoc() })
	})
}

// webThemeName mirrors the canvas tokens (editor-web/src/theme/tokens.ts).
// a.dark is derived during the view build — a just-clicked toggle has not
// rebuilt yet — so derive from themeMode (0 light, 1 dark) directly.
func (a *App) webThemeName() string {
	if a.themeMode == 1 {
		return "dark"
	}
	return "light"
}

// pushWebDoc hands the current document to the canvas. Safe before the
// page is ready: MyGo queues events until DOMContentLoaded.
func (a *App) pushWebDoc() {
	if a.webView == nil || a.webView.IsDestroyed() {
		return
	}
	a.webPushRev++
	_ = evBridge.EmitPage(a.webView.Page(), bridgeMsg{
		Type:     "document.set",
		Path:     a.path,
		Markdown: a.source,
		Revision: a.webPushRev,
		Theme:    a.webThemeName(),
	})
}

// scrollToHeading asks the canvas to scroll a heading into view.
// webTokens carries canvas-appearance settings beyond light/dark; the
// body font size mirrors the native typography setting.
func (a *App) webTokens() map[string]string {
	return map[string]string{"--muse-body-size": fmt.Sprintf("%.0fpx", a.fontSize)}
}

func (a *App) scrollToHeading(text string) {
	if a.webView == nil || a.webView.IsDestroyed() {
		return
	}
	_ = evBridge.EmitPage(a.webView.Page(), bridgeMsg{Type: "command", Name: "scrollToHeading", Text: text})
}

// scrollToText asks the canvas to scroll the first line containing the
// snippet into view (search-hit navigation).
func (a *App) scrollToText(snippet string) {
	if a.webView == nil || a.webView.IsDestroyed() {
		return
	}
	_ = evBridge.EmitPage(a.webView.Page(), bridgeMsg{Type: "command", Name: "scrollToText", Text: snippet})
}

func (a *App) pushWebTheme() {
	if a.webView == nil || a.webView.IsDestroyed() {
		return
	}
	_ = evBridge.EmitPage(a.webView.Page(), bridgeMsg{Type: "theme.set", Theme: a.webThemeName(), Tokens: a.webTokens()})
}

// applyWebChanged takes a debounced document.changed from the canvas.
// Revisions at or below the last pushed set are echoes of our own
// document.set (the canvas suppresses them too; this is the second guard).
func (a *App) applyWebChanged(markdown string, revision int) {
	if a.webView == nil || revision <= a.webPushRev {
		return
	}
	if markdown == a.source {
		return
	}
	a.source = markdown
	a.refreshDoc()
	a.dirty = true
	a.updateTitle()
	if a.win != nil {
		a.win.Invalidate()
	}
}

// requestWebSave asks the canvas for its freshest markdown (RFC: saves must
// not depend on the last debounced change) and waits briefly for the
// reply. Called from the main thread; the reply path is channel-only, so
// the wait cannot deadlock.
func (a *App) requestWebSave() {
	if a.webView == nil || a.webView.IsDestroyed() {
		return
	}
	ch := make(chan string, 1)
	a.saveMu.Lock()
	a.saveReply = ch
	a.saveMu.Unlock()
	defer func() {
		a.saveMu.Lock()
		a.saveReply = nil
		a.saveMu.Unlock()
	}()
	_ = evBridge.EmitPage(a.webView.Page(), bridgeMsg{Type: "command", Name: "requestSave"})
	select {
	case md := <-ch:
		if md != "" && md != a.source {
			a.source = md
			a.refreshDoc()
		}
	case <-time.After(400 * time.Millisecond):
		// Fall back to the last debounced change; still correct, just
		// possibly missing the final keystrokes.
	}
}

// serveWebFrontend installs the embedded canvas build at mygo://localhost/.
func serveWebFrontend() {
	sub, err := fs.Sub(web.Dist, "dist")
	if err != nil {
		log.Printf("embedded web editor missing: %v", err)
		return
	}
	mygo.SetFrontend(sub)
}
