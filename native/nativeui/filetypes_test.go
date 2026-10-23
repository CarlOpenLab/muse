package nativeui

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEditableFileTypes(t *testing.T) {
	for _, p := range []string{"a.md", "a.txt", "a.json", "a.yaml", "a.go", "README", "LICENSE"} {
		if !isEditableFile(p) {
			t.Errorf("%q should be editable", p)
		}
	}
	for _, p := range []string{"a.png", "a.jpg", "a.pdf", "a.zip", "a.exe", "a.bin", "a.docx"} {
		if isEditableFile(p) {
			t.Errorf("%q should not be editable", p)
		}
	}
}

func TestChildrenHidesBinaryFiles(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"a.md", "b.png", "c.json", "d.pdf"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.Mkdir(filepath.Join(dir, "sub"), 0o755); err != nil {
		t.Fatal(err)
	}
	a := New()
	got := a.children(dir)
	want := map[string]bool{
		filepath.Join(dir, "sub"):    true,
		filepath.Join(dir, "a.md"):   true,
		filepath.Join(dir, "c.json"): true,
	}
	if len(got) != len(want) {
		t.Fatalf("children = %v", got)
	}
	for _, p := range got {
		if !want[p] {
			t.Errorf("unexpected child %q", p)
		}
	}
}

func TestOpenRejectsBinaryData(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "fake.txt")
	if err := os.WriteFile(path, []byte{'a', 0, 'b'}, 0o644); err != nil {
		t.Fatal(err)
	}
	a := New()
	a.source = "keep"
	a.openPathNow(path)
	if a.source != "keep" {
		t.Fatalf("source = %q", a.source)
	}
}

func TestOpenRejectsBinaryExtension(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "image.png")
	if err := os.WriteFile(path, []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}
	a := New()
	a.source = "keep"
	a.openPathNow(path)
	if a.source != "keep" {
		t.Fatalf("source = %q", a.source)
	}
}
