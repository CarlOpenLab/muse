package nativeui

import (
	"path/filepath"
	"strings"
)

// appBundleFromExecutable 认出正在运行的 Muse 属于哪个 .app。设置里那个
// 「设为默认」按钮只能把一个真实的应用包交给 macOS；`go run` 出来的裸
// 二进制没有 bundle 可交，这时返回空串，按钮不出现。
//
// 应用包里的可执行文件在 <bundle>.app/Contents/MacOS/<name>，只认这一种
// 结构：Contents/Resources 里的辅助程序不属于可设置的 app。
func appBundleFromExecutable(exe string) string {
	macos := filepath.Dir(exe)
	if filepath.Base(macos) != "MacOS" {
		return ""
	}
	contents := filepath.Dir(macos)
	if filepath.Base(contents) != "Contents" {
		return ""
	}
	bundle := filepath.Dir(contents)
	if !strings.HasSuffix(bundle, ".app") {
		return ""
	}
	return bundle
}

// sameApp reports whether two paths name the same application. macOS records
// a default handler by application, not by the path of one copy: an installed
// Muse.app and a dist copy share a bundle identifier, and after either one is
// set the system may keep reporting the installed path. Comparing paths alone
// would call that success a failure.
func sameApp(defaultPath, appPath string, bundleID func(string) string) bool {
	if defaultPath == "" || appPath == "" {
		return false
	}
	if filepath.Clean(defaultPath) == filepath.Clean(appPath) {
		return true
	}
	id := bundleID(appPath)
	return id != "" && id == bundleID(defaultPath)
}
