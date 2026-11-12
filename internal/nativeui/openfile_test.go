package nativeui

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/egoist/mygo/ui"
)

// TestOpenFileFromTheSystem 双击 .md 文件进 Muse：系统把文件路径交给应用，
// 应用要把它当成「打开」来处理——干净文档先存当前的，再换到这个文件。
//
// 光在 mygo.json 里声明文件类型只让 Muse 出现在系统的「打开方式」列表里；
// 没人接住那个路径，双击就只是把 Muse 带到前台，文档还是老的。
func TestOpenFileFromTheSystem(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("MUSE_CONFIG_DIR", dir)
	p := filepath.Join(dir, "from-system.md")
	if err := os.WriteFile(p, []byte("# 系统给的\n\n正文。\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	a := New()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	tt.Frame()

	// 窗口不在（测试里就是）：文件先存着，等窗口。这里把窗口开起来的那一
	// 步补上——run.go 的 openWindow 里做的就是这句。
	a.openFileFromSystem(p)
	if a.pendingOpen != p {
		t.Fatalf("pendingOpen = %q, want the file held until the window exists", a.pendingOpen)
	}
	a.pendingOpen = ""
	a.requestOpen(p)
	tt.Frame()
	tt.Frame()

	if a.path != p {
		t.Fatalf("path = %q, want %q", a.path, p)
	}
	if a.source != "# 系统给的\n\n正文。\n" {
		t.Fatalf("source = %q, want the file the system handed over", a.source)
	}
	// 文档要是真的排进去了：正文在编辑器里有位置，不是只换了字段。
	if _, _, ok := a.ed.WindowPoint(5); !ok {
		t.Fatal("the document the system opened is not laid out")
	}
}
