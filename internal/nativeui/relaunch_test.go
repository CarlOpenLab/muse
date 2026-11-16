package nativeui

import (
	"os"
	"strings"
	"testing"
)

// TestRelaunchAfterSave covers the truth table of "an update was installed,
// the quit was canceled by the dirty-document guard": only both together
// resume the relaunch once the save dialog is answered.
func TestRelaunchAfterSave(t *testing.T) {
	cases := []struct {
		installed, canceled, want bool
	}{
		{false, false, false},
		{true, false, false},
		{false, true, false},
		{true, true, true},
	}
	for _, c := range cases {
		a := New()
		a.updateInstalled = c.installed
		a.quitCanceled = c.canceled
		if got := a.shouldRelaunchAfterSave(); got != c.want {
			t.Fatalf("updateInstalled=%v quitCanceled=%v: shouldRelaunchAfterSave = %v, want %v",
				c.installed, c.canceled, got, c.want)
		}
	}
}

// TestFinishCloseAfterSaveRelaunchesAndClears: the answered dialog resumes
// the relaunch only when both flags are set, and consumes them so a second
// close cannot restart the app again.
func TestFinishCloseAfterSaveRelaunchesAndClears(t *testing.T) {
	a := New()
	a.updateInstalled = true
	a.quitCanceled = true
	if !a.finishCloseAfterSave() {
		t.Fatal("did not resume the relaunch after save")
	}
	if a.updateInstalled || a.quitCanceled {
		t.Fatalf("relaunch flags not consumed: updateInstalled=%v quitCanceled=%v",
			a.updateInstalled, a.quitCanceled)
	}
}

// TestSaveWithoutRelaunchClearsQuitLatch: answering the dialog with an
// ordinary close must clear the canceled-quit latch. Otherwise a canceled
// quit earlier in the session leaks into a later dirty window close once an
// update is installed, and on macOS closing a window would restart the app.
func TestSaveWithoutRelaunchClearsQuitLatch(t *testing.T) {
	a := New()
	a.quitCanceled = true
	if a.finishCloseAfterSave() {
		t.Fatal("relaunch without an installed update")
	}
	if a.quitCanceled {
		t.Fatal("the canceled-quit latch survived an answered dialog")
	}
}

// TestRelaunchCancelKeepsInstalled: cancelling the save dialog means this
// quit does not relaunch, but the update is already installed, so a later
// quit with a clean document should still relaunch into it.
func TestRelaunchCancelKeepsInstalled(t *testing.T) {
	a := New()
	a.updateInstalled = true
	a.quitCanceled = true
	a.cancelRelaunchAfterSave()
	if a.shouldRelaunchAfterSave() {
		t.Fatal("a canceled close still wants to relaunch")
	}
	if !a.updateInstalled {
		t.Fatal("a canceled close forgot the installed update")
	}
}

// TestRunRegistersNativeUpdater checks the wiring that a unit test cannot
// start: the native update window's plugin, and the two callbacks the
// resumable relaunch needs. The webview plugin must not be used alongside it.
func TestRunRegistersNativeUpdater(t *testing.T) {
	src := readRunGo(t)
	for _, want := range []string{
		"mygo.Use(updaternative.New(",
		"updater.OnInstalled(",
		"mygo.App.OnQuitCanceled(",
	} {
		if !strings.Contains(src, want) {
			t.Fatalf("run.go missing %q", want)
		}
	}
	if strings.Contains(src, "updater.Plugin") {
		t.Fatal("run.go uses updater.Plugin; the native window replaces it")
	}
}

// TestMenuHasUpdateEntry checks that the menu bar offers 更新, whose item is
// the updater's own so its label and click stay in one place.
func TestMenuHasUpdateEntry(t *testing.T) {
	src := readRunGo(t)
	for _, want := range []string{`Label: "更新"`, "updater.MenuItem()"} {
		if !strings.Contains(src, want) {
			t.Fatalf("run.go missing %q", want)
		}
	}
}

func readRunGo(t *testing.T) string {
	t.Helper()
	src, err := os.ReadFile("run.go")
	if err != nil {
		t.Fatal(err)
	}
	return string(src)
}
