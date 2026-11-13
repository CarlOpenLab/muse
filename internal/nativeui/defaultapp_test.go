package nativeui

import (
	"path/filepath"
	"testing"
)

// TestAppBundleFromExecutable 认出正在运行的 Muse 属于哪个 .app。设置里那个
// 「设为默认」按钮只能把一个真实的应用包交给 macOS；`go run` 出来的裸二进制
// 没有 bundle 可交给系统，这时必须认成空，按钮不能出现。
func TestAppBundleFromExecutable(t *testing.T) {
	tests := []struct {
		name string
		exe  string
		want string
	}{
		{
			name: "installed app",
			exe:  "/Applications/Muse.app/Contents/MacOS/Muse",
			want: "/Applications/Muse.app",
		},
		{
			name: "dev app with spaces",
			exe:  "/Users/carl/dev/own/muse/.mygo/dev/Muse Dev.app/Contents/MacOS/Muse",
			want: "/Users/carl/dev/own/muse/.mygo/dev/Muse Dev.app",
		},
		{
			name: "plain binary",
			exe:  "/usr/local/bin/muse",
			want: "",
		},
		{
			name: "not inside a .app",
			exe:  "/Applications/Muse/Contents/MacOS/Muse",
			want: "",
		},
		{
			name: "resources helper of the app",
			exe:  "/Applications/Muse.app/Contents/Resources/Muse",
			want: "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			want := filepath.FromSlash(tt.want)
			if got := appBundleFromExecutable(tt.exe); got != want {
				t.Fatalf("appBundleFromExecutable(%q) = %q, want %q", tt.exe, got, want)
			}
		})
	}
}

// TestSameAppAcceptsAnotherCopyOfTheSameBundle 系统记的是应用，不是某一份
// 拷贝的路径：装好的 Muse 已经是默认时，从 dist 里运行的那一份再点「设为
// 默认」，系统读回来的仍是 /Applications/Muse.app。按路径比会把这次成功
// 说成失败；同一个 bundle id 就是同一个应用，应该认成功。
func TestSameAppAcceptsAnotherCopyOfTheSameBundle(t *testing.T) {
	ids := map[string]string{
		"/Applications/Muse.app":                      "com.muse.app",
		"/Users/carl/dev/own/muse/dist/muse/Muse.app": "com.muse.app",
		"/Applications/WorkBuddy.app":                 "com.workbuddy.app",
	}
	bundleID := func(path string) string { return ids[path] }
	tests := []struct {
		name        string
		defaultPath string
		appPath     string
		want        bool
	}{
		{name: "same path", defaultPath: "/Applications/Muse.app", appPath: "/Applications/Muse.app", want: true},
		{name: "another copy of the same bundle", defaultPath: "/Applications/Muse.app", appPath: "/Users/carl/dev/own/muse/dist/muse/Muse.app", want: true},
		{name: "trailing slash", defaultPath: "/Applications/Muse.app/", appPath: "/Applications/Muse.app", want: true},
		{name: "different bundles", defaultPath: "/Applications/WorkBuddy.app", appPath: "/Applications/Muse.app", want: false},
		{name: "no default", defaultPath: "", appPath: "/Applications/Muse.app", want: false},
		{name: "no app", defaultPath: "/Applications/Muse.app", appPath: "", want: false},
		{name: "unknown bundle", defaultPath: "/Applications/Muse.app", appPath: "/tmp/Muse.app", want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sameApp(tt.defaultPath, tt.appPath, bundleID); got != tt.want {
				t.Fatalf("sameApp(%q, %q) = %v, want %v", tt.defaultPath, tt.appPath, got, tt.want)
			}
		})
	}
}
