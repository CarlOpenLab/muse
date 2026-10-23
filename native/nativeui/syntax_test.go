package nativeui

import (
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestCodeRangesSkipFenceAndColorCode(t *testing.T) {
	src := "```go\nfunc main() {}\n```\n"
	t2 := ui.Theme{}
	ranges := codeRanges(src, "go", &t2)
	if len(ranges) == 0 {
		t.Fatal("no code colors")
	}
	if ranges[0].Start < len("```go\n") {
		t.Fatalf("color started inside the fence: %+v", ranges[0])
	}
	if ranges[0].Start+ranges[0].End <= 0 {
		t.Fatal("invalid range")
	}
}
