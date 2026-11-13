//go:build !darwin

package nativeui

import "errors"

// currentAppBundle 在非 macOS 平台没有 Cocoa 应用包可以交给系统。
func currentAppBundle() string {
	return ""
}

// requestDefaultMarkdownApp 只在 macOS 上有实现；其他平台由系统的文件
// 关联设置负责。
func requestDefaultMarkdownApp(string, func(error)) error {
	return errors.New("这个系统不支持在这里设置默认应用")
}
