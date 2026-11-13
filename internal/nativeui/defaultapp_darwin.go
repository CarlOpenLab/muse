//go:build darwin

package nativeui

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
	"unsafe"

	"github.com/ebitengine/purego"
	"github.com/ebitengine/purego/objc"
)

// currentAppBundle 是正在运行的 Muse 所在的 .app；从 `go run` 或裸二进制
// 启动时没有 bundle，返回空串。
func currentAppBundle() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	return appBundleFromExecutable(exe)
}

var errMarkdownDefaultNotChanged = errors.New("系统没有更改默认应用")

const nsUserCancelledError = 3072

var (
	defaultAppFrameworksOnce sync.Once
	defaultAppFrameworksErr  error

	selSetDefaultApplication objc.SEL
	selDefaultApplicationFor objc.SEL
	selSharedWorkspace       objc.SEL
	selFileURLWithPath       objc.SEL
	selTypeWithExtension     objc.SEL
	selStringWithUTF8String  objc.SEL
	selUTF8String            objc.SEL
	selLocalizedDescription  objc.SEL
	selErrorCode             objc.SEL
	selPath                  objc.SEL
	selBundleWithPath        objc.SEL
	selBundleIdentifier      objc.SEL
)

// loadDefaultAppFrameworks loads the frameworks and resolves the selectors
// once. The system frameworks are always present on macOS; a failure here
// means the process cannot talk to AppKit at all.
func loadDefaultAppFrameworks() error {
	defaultAppFrameworksOnce.Do(func() {
		for _, path := range []string{
			"/System/Library/Frameworks/Foundation.framework/Foundation",
			"/System/Library/Frameworks/AppKit.framework/AppKit",
			"/System/Library/Frameworks/UniformTypeIdentifiers.framework/UniformTypeIdentifiers",
		} {
			if _, err := purego.Dlopen(path, purego.RTLD_NOW|purego.RTLD_GLOBAL); err != nil {
				defaultAppFrameworksErr = fmt.Errorf("载入 %s 失败: %w", filepath.Base(path), err)
				return
			}
		}
		selSetDefaultApplication = objc.RegisterName("setDefaultApplicationAtURL:toOpenContentType:completionHandler:")
		selDefaultApplicationFor = objc.RegisterName("URLForApplicationToOpenContentType:")
		selSharedWorkspace = objc.RegisterName("sharedWorkspace")
		selFileURLWithPath = objc.RegisterName("fileURLWithPath:")
		selTypeWithExtension = objc.RegisterName("typeWithFilenameExtension:")
		selStringWithUTF8String = objc.RegisterName("stringWithUTF8String:")
		selUTF8String = objc.RegisterName("UTF8String")
		selLocalizedDescription = objc.RegisterName("localizedDescription")
		selErrorCode = objc.RegisterName("code")
		selPath = objc.RegisterName("path")
		selBundleWithPath = objc.RegisterName("bundleWithPath:")
		selBundleIdentifier = objc.RegisterName("bundleIdentifier")
	})
	return defaultAppFrameworksErr
}

func nsString(s string) objc.ID {
	// stringWithUTF8String: needs a NUL-terminated C string; the extra byte
	// keeps it alive for the duration of the call.
	return objc.Send[objc.ID](objc.ID(objc.GetClass("NSString")), selStringWithUTF8String, s+"\x00")
}

func goString(id objc.ID) string {
	if id == 0 {
		return ""
	}
	p := objc.Send[unsafe.Pointer](id, selUTF8String)
	if p == nil {
		return ""
	}
	n := 0
	for *(*byte)(unsafe.Add(p, n)) != 0 {
		n++
	}
	return string(unsafe.Slice((*byte)(p), n))
}

func markdownUTType() objc.ID {
	return objc.Send[objc.ID](objc.ID(objc.GetClass("UTType")), selTypeWithExtension, nsString("md"))
}

// appBundleID reads the bundle identifier of an app on disk; "" when the path
// is not an app bundle or has no identifier.
func appBundleID(path string) string {
	if path == "" {
		return ""
	}
	bundle := objc.Send[objc.ID](objc.ID(objc.GetClass("NSBundle")), selBundleWithPath, nsString(path))
	if bundle == 0 {
		return ""
	}
	return goString(objc.Send[objc.ID](bundle, selBundleIdentifier))
}

// isMarkdownDefault reports whether the system currently opens Markdown with
// appPath. It only reads LaunchServices, so it is safe to call from tests and
// from the completion block.
func isMarkdownDefault(appPath string) bool {
	if appPath == "" || loadDefaultAppFrameworks() != nil {
		return false
	}
	ut := markdownUTType()
	if ut == 0 {
		return false
	}
	ws := objc.Send[objc.ID](objc.ID(objc.GetClass("NSWorkspace")), selSharedWorkspace)
	url := objc.Send[objc.ID](ws, selDefaultApplicationFor, ut)
	if url == 0 {
		return false
	}
	return sameApp(goString(objc.Send[objc.ID](url, selPath)), appPath, appBundleID)
}

// requestDefaultMarkdownApp asks the system to open Markdown with appPath.
// On current macOS the change triggers the user's consent: the system
// shows its own prompt and calls done after the user answers.
func requestDefaultMarkdownApp(appPath string, done func(error)) error {
	if appPath == "" {
		return errors.New("没有可交给系统的应用包")
	}
	if err := loadDefaultAppFrameworks(); err != nil {
		return err
	}
	ut := markdownUTType()
	if ut == 0 {
		return errors.New("系统不认 Markdown 这种文件类型")
	}
	appURL := objc.Send[objc.ID](objc.ID(objc.GetClass("NSURL")), selFileURLWithPath, nsString(appPath))
	if appURL == 0 {
		return fmt.Errorf("无法表示应用路径 %s", appPath)
	}
	ws := objc.Send[objc.ID](objc.ID(objc.GetClass("NSWorkspace")), selSharedWorkspace)
	if ws == 0 {
		return errors.New("无法访问系统的工作区")
	}

	block := objc.NewBlock(func(_ objc.Block, nsErr objc.ID) {
		var err error
		if nsErr != 0 {
			if code := objc.Send[int64](nsErr, selErrorCode); code == nsUserCancelledError {
				err = errors.New("已取消")
			} else if msg := goString(objc.Send[objc.ID](nsErr, selLocalizedDescription)); msg != "" {
				err = errors.New(msg)
			} else {
				err = errors.New("系统拒绝了这次更改")
			}
		} else if !waitForMarkdownDefault(appPath) {
			err = errMarkdownDefaultNotChanged
		}
		done(err)
	})
	objc.ID(ws).Send(selSetDefaultApplication, appURL, ut, block)
	// The system copies the block when it keeps it past this call; our +1
	// reference is no longer needed.
	block.Release()
	return nil
}

// waitForMarkdownDefault gives LaunchServices a moment to publish the change
// the completion handler just reported.
func waitForMarkdownDefault(appPath string) bool {
	for range 3 {
		if isMarkdownDefault(appPath) {
			return true
		}
		time.Sleep(100 * time.Millisecond)
	}
	return isMarkdownDefault(appPath)
}
