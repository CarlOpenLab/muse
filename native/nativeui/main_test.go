package nativeui

// TestMain points every test at a throwaway config directory. New() reads
// ai.json and chat.json, so without this a test machine with saved settings
// or a chat transcript would render someone's real conversation into the
// test view and fail assertions about the empty state. Tests that care
// about the path still set MUSE_CONFIG_DIR themselves.

import (
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "muse-nativeui-test-")
	if err != nil {
		panic(err)
	}
	os.Setenv("MUSE_CONFIG_DIR", dir)
	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}
