//go:build darwin

package main

// 调试工具：MUSE_DEBUG_MENU 设置时，窗口打开 5 秒后程序化触发指定菜单项的
// 原生动作，等价于用户点击。用来在不依赖手动操作的情况下验证
// macOS 菜单接线（NSMenuItem -> mygoMenuItemClicked: -> Go Click）是否通畅：
// 触发成功则日志出现 [muse] menu action: <action>。
//
//	MUSE_DEBUG_MENU=1                → 「文件 -> 新建」
//	MUSE_DEBUG_MENU=视图:开发者工具    → 任意「菜单:项」

import (
	"log"
	"os"
	"strings"
	"time"
	"unsafe"

	"github.com/ebitengine/purego"

	"muse/services"
)

var (
	msgSend0 func(obj, sel uintptr) uintptr
	msgSend1 func(obj, sel, a1 uintptr) uintptr
)

func init() {
	lib, err := purego.Dlopen("/System/Library/Frameworks/AppKit.framework/AppKit", purego.RTLD_LAZY)
	if err != nil {
		log.Printf("[muse] debug menu: %v", err)
		return
	}
	var getClass func(name *byte) uintptr
	var regSel func(name *byte) uintptr
	purego.RegisterLibFunc(&getClass, lib, "objc_getClass")
	purego.RegisterLibFunc(&regSel, lib, "sel_registerName")
	purego.RegisterLibFunc(&msgSend0, lib, "objc_msgSend")
	purego.RegisterLibFunc(&msgSend1, lib, "objc_msgSend")
	objcGetClass = getClass
	selRegisterName = regSel
}

var (
	objcGetClass    func(name *byte) uintptr
	selRegisterName func(name *byte) uintptr
)

func cstr(s string) *byte {
	b := append([]byte(s), 0)
	return &b[0]
}

func sel(name string) uintptr { return selRegisterName(cstr(name)) }

func goStr(p uintptr) string {
	if p == 0 {
		return ""
	}
	var buf []byte
	// p 来自 objc_msgSend（C 指针），转 unsafe.Pointer 是合法的；
	// go vet 的 unsafeptr 检查无法区分来源，这里会有一条已知误报。
	base := unsafe.Pointer(p)
	for i := uintptr(0); ; i++ {
		b := *(*byte)(unsafe.Add(base, i))
		if b == 0 {
			return string(buf)
		}
		buf = append(buf, b)
	}
}

func nsTitle(item uintptr) string {
	ns := msgSend0(item, sel("title"))
	return goStr(msgSend0(ns, sel("UTF8String")))
}

// findItem 在 menu 里找标题为 title 的菜单项，返回 (item, index)。
func findItem(menu uintptr, title string) (uintptr, int) {
	count := msgSend0(menu, sel("numberOfItems"))
	for i := uintptr(0); i < count; i++ {
		item := msgSend1(menu, sel("itemAtIndex:"), i)
		if item != 0 && nsTitle(item) == title {
			return item, int(i)
		}
	}
	return 0, -1
}

// debugTriggerMenu 程序化触发 mainMenu 里 menuTitle -> itemTitle 的动作。
func debugTriggerMenu(menuTitle, itemTitle string) {
	if objcGetClass == nil {
		return
	}
	app := msgSend0(objcGetClass(cstr("NSApplication")), sel("sharedApplication"))
	mainMenu := msgSend0(app, sel("mainMenu"))
	if mainMenu == 0 {
		log.Printf("[muse] debug menu: no mainMenu")
		return
	}
	top, _ := findItem(mainMenu, menuTitle)
	if top == 0 {
		log.Printf("[muse] debug menu: %q not found", menuTitle)
		return
	}
	sub := msgSend0(top, sel("submenu"))
	_, idx := findItem(sub, itemTitle)
	if idx < 0 {
		log.Printf("[muse] debug menu: %q not found in %q", itemTitle, menuTitle)
		return
	}
	log.Printf("[muse] debug menu: triggering %q -> %q", menuTitle, itemTitle)
	msgSend1(sub, sel("performActionForItemAtIndex:"), uintptr(idx))
}

// scheduleDebugMenuTrigger 在 MUSE_DEBUG_MENU 设置时挂一个 5 秒后的自触发。
func scheduleDebugMenuTrigger() {
	menuTitle, itemTitle := "文件", "新建"
	if spec := os.Getenv("MUSE_DEBUG_MENU"); spec != "" && spec != "1" {
		if parts := strings.SplitN(spec, ":", 2); len(parts) == 2 {
			menuTitle, itemTitle = parts[0], parts[1]
		}
	}
	time.AfterFunc(5*time.Second, func() {
		debugTriggerMenu(menuTitle, itemTitle)
		// 便于脚本化验证：触发后把 inspector 状态打进日志（inspector 显示是异步的，约 1s）
		w := services.S.Win
		if w == nil {
			return
		}
		time.AfterFunc(time.Second, func() { log.Printf("[muse] debug: IsDevToolsOpened=%v", w.IsDevToolsOpened()) })
	})
}
