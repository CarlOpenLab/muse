//go:build !darwin

package main

// 菜单自动化调试（debug_darwin.go）依赖 ObjC 运行时，只在 macOS 可用；
// 其他平台保留空实现，保证 MUSE_DEBUG_MENU 分支能通过编译。

func scheduleDebugMenuTrigger() {}
