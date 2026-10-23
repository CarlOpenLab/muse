package nativeui

// End-to-end flows over the real App view driven by the headless UI tester:
// open a file from the workspace tree, edit a rendered block in place, save,
// and verify the bytes that reach disk. These are the same seams the shipped
// app uses (no test-only code paths beyond the dialog stubs).

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

// save() writes asynchronously on the UI queue; tests poll the file like a
// user's editor would observe it.
func waitFileContains(t *testing.T, path, needle string) string {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	var got string
	for {
		b, err := os.ReadFile(path)
		if err == nil {
			got = string(b)
			if strings.Contains(got, needle) {
				return got
			}
		}
		if time.Now().After(deadline) {
			return got
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func e2eWorkspace(t *testing.T) (string, string) {
	t.Helper()
	dir := t.TempDir()
	one := filepath.Join(dir, "周报.md")
	src := "# 缪斯周报\n\n## 本周进展\n\n- 原始行\n\n> 所写，即所见。\n"
	if err := os.WriteFile(one, []byte(src), 0o644); err != nil {
		t.Fatal(err)
	}
	return dir, one
}

func TestE2EOpenEditSaveRoundTrip(t *testing.T) {
	dir, one := e2eWorkspace(t)

	a := New()
	a.setWorkspace(dir)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()

	if err := tt.Click("周报.md"); err != nil {
		t.Fatalf("open file from tree: %v", err)
	}
	tt.Frame()
	if !tt.HasText("原始行") {
		t.Fatalf("file content not rendered; texts = %q", tt.Texts())
	}
	if a.path != one {
		t.Fatalf("a.path = %q, want %q", a.path, one)
	}

	// click a rendered list item, move to line end, type, finish
	if err := tt.Click("原始行"); err != nil {
		t.Fatalf("click block: %v", err)
	}
	tt.Frame()
	tt.Key(0, ui.KeyEnd)
	tt.Type(" E2E 追加")
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if a.dirty {
		// escape committed the edit; dirty stays until save in some paths —
		// what matters is the on-disk bytes below
		t.Logf("dirty after edit: %v", a.dirty)
	}

	a.save()
	tt.Frame()

	got := waitFileContains(t, one, "E2E 追加")
	for _, want := range []string{"E2E 追加", "# 缪斯周报", "## 本周进展", "- 原始行 E2E 追加", "> 所写，即所见。"} {
		if !strings.Contains(got, want) {
			t.Fatalf("saved markdown missing %q; got:\n%s", want, got)
		}
	}
	if a.dirty {
		t.Fatalf("dirty stayed true after a successful save")
	}
}

func TestE2ESaveUntitledViaDialog(t *testing.T) {
	a := New()
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()
	if !tt.HasText("Muse · 原生工作台") {
		t.Fatalf("welcome doc missing; texts = %q", tt.Texts())
	}

	// edit the welcome quote line in place (click by full element text)
	if err := tt.Click("原生渲染由 mdoc 完成：标题、列表、引用、代码块、表格与行内样式都在这里重画。"); err != nil {
		t.Fatalf("click welcome quote: %v", err)
	}
	tt.Frame()
	tt.Type("E2E 已验证")
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()

	dir := t.TempDir()
	target := filepath.Join(dir, "e2e-untitled.md")
	old := saveDialog
	saveDialog = func(mygo.SaveDialogOptions) (string, error) { return target, nil }
	defer func() { saveDialog = old }()

	a.save()
	tt.Frame()

	b := []byte(waitFileContains(t, target, "E2E 已验证"))
	if !strings.Contains(string(b), "E2E 已验证") {
		t.Fatalf("saved doc missing typed text; got:\n%s", b)
	}
	if a.path != target {
		t.Fatalf("a.path = %q, want %q", a.path, target)
	}
}

func TestE2ESwitchFilesKeepsSavedState(t *testing.T) {
	dir, one := e2eWorkspace(t)
	two := filepath.Join(dir, "notes.md")
	if err := os.WriteFile(two, []byte("# 笔记\n\n第二份文档。\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	a := New()
	a.setWorkspace(dir)
	tt := ui.NewTester(a.View, 1200, 800)
	tt.Frame()

	if err := tt.Click("周报.md"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if err := tt.Click("原始行"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	tt.Key(0, ui.KeyEnd)
	tt.Type(" 已保存再切走")
	tt.Frame()
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	a.save()
	waitFileContains(t, one, "已保存再切走")
	deadline := time.Now().Add(time.Second)
	for (a.busy || a.dirty) && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	t.Logf("before switch: dirty=%v busy=%v rich=%v path=%q", a.dirty, a.busy, a.rich != nil, a.path)
	tt.Frame()

	if err := tt.Click("notes.md"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	t.Logf("after click notes: path=%q", a.path)
	if !tt.HasText("第二份文档。") {
		t.Fatalf("notes.md not rendered; texts = %q", tt.Texts())
	}
	if err := tt.Click("周报.md"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if !tt.HasText("已保存再切走") {
		t.Fatalf("saved edit not re-rendered after switching back; texts = %q", tt.Texts())
	}
	if a.path != one {
		t.Fatalf("a.path = %q, want %q", a.path, one)
	}
}
