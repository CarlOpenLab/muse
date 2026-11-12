package nativeui

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAppearanceDefaultsToBeaconValues(t *testing.T) {
	a := New()
	if got := a.cardOpacity(); got != defaultCardOpacity {
		t.Fatalf("cardOpacity() = %v, want %v", got, defaultCardOpacity)
	}
	if got := a.cardBlur(); got != defaultCardBlur {
		t.Fatalf("cardBlur() = %q, want %q", got, defaultCardBlur)
	}
}

func TestAppearanceClampsStoredValues(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "appearance.json")
	write := func(s string) {
		if err := os.WriteFile(path, []byte(s), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("MUSE_CONFIG_DIR", dir)

	// A hand-edited file must not leave the card in a state the shell cannot
	// show: an opacity under the floor would make the text unreadable over
	// the desktop, and a blur id no material matches would draw nothing.
	write(`{"cardOpacity":0.01,"cardBlur":"wat"}`)
	a := New()
	if got := a.cardOpacity(); got != minCardOpacity {
		t.Fatalf("cardOpacity() = %v, want clamped %v", got, minCardOpacity)
	}
	if got := a.cardBlur(); got != defaultCardBlur {
		t.Fatalf("cardBlur() = %q, want %q", got, defaultCardBlur)
	}

	// Above the ceiling the card goes fully opaque, which is what 1.0 means.
	write(`{"cardOpacity":4,"cardBlur":"none"}`)
	a = New()
	if got := a.cardOpacity(); got != 1 {
		t.Fatalf("cardOpacity() = %v, want 1", got)
	}
	if got := a.cardBlur(); got != "none" {
		t.Fatalf("cardBlur() = %q, want none", got)
	}
}

func TestAppearanceSurvivesSaveAndLoad(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("MUSE_CONFIG_DIR", dir)

	a := New()
	a.setCardOpacity(0.62)
	a.setCardBlur("medium")
	a.setCardWidth(640)

	b := New()
	if got := b.cardOpacity(); got != 0.62 {
		t.Fatalf("reloaded cardOpacity() = %v, want 0.62", got)
	}
	if got := b.cardBlur(); got != "medium" {
		t.Fatalf("reloaded cardBlur() = %q, want medium", got)
	}
	if got := b.cardWidth(); got != 640 {
		t.Fatalf("reloaded cardWidth() = %v, want 640", got)
	}
}
