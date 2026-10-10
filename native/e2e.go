// e2e 冒烟测试壳：MUSE_E2E=1 时，用户数据指向一次性临时目录（不污染真实
// recent / draft / settings），页面加载完成后把 e2e/assertions.js 注入页面，
// 打印 E2E_RESULT 一行 JSON 并以 0/1 退出。
//
// 断言脚本用合成事件 + DOM 断言驱动（与旧 Electron 版 scripts/e2e-typora.mjs
// 相同的方式），由 scripts/e2e-muse.mjs 启动与收集结果。需要图形界面，
// 不适合无头 CI。
package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/egoist/mygo"
)

//go:embed e2e/assertions.js
var e2eScript string

var e2eUserDataDir string

func e2eEnabled() bool { return os.Getenv("MUSE_E2E") == "1" }

// e2ePrepareUserData 必须在读取用户数据（services.NewFiles）之前调用。
func e2ePrepareUserData() {
	if !e2eEnabled() {
		return
	}
	dir, err := os.MkdirTemp("", "muse-e2e-ud-")
	if err != nil {
		log.Fatalf("[e2e] 创建临时用户目录失败: %v", err)
	}
	e2eUserDataDir = dir
	mygo.App.SetPath(mygo.PathUserData, dir)
	// 应用启动会在「文档」目录建/开 Untitled.md（CreateDefault），导出/图片也走
	// 这些目录——全部重定向到临时目录，e2e 绝不触碰真实文件。
	for _, name := range []mygo.PathName{mygo.PathDocuments, mygo.PathDesktop, mygo.PathDownloads} {
		mygo.App.SetPath(name, filepath.Join(dir, string(name)))
	}
	log.Printf("[e2e] userData -> %s", dir)
}

// e2eAttach 在窗口上挂「页面加载完成后跑断言」的钩子。
func e2eAttach(win *mygo.Window) {
	if !e2eEnabled() {
		return
	}
	win.OnDidFinishLoad(func() {
		go func() {
			log.Printf("[e2e] 页面加载完成，注入断言脚本")
			// 从终端启动时窗口未必拿到焦点；ProseMirror 在未聚焦时不同步
			// 折叠光标，断言里的选区操作需要窗口处于前台。
			mygo.App.Focus()
			win.Focus()
			res, err := win.Eval(e2eScript)
			code := 1
			if err != nil {
				log.Printf("[e2e] 注入失败: %v", err)
				fmt.Printf("E2E_RESULT %s\n", mustJSON(map[string]any{"ok": false, "error": err.Error()}))
			} else {
				fmt.Printf("E2E_RESULT %s\n", mustJSON(res))
				if m, isMap := res.(map[string]any); isMap {
					if ok, isBool := m["ok"].(bool); isBool && ok {
						code = 0
					}
				}
			}
			if e2eUserDataDir != "" {
				_ = os.RemoveAll(e2eUserDataDir)
			}
			mygo.App.Exit(code)
		}()
	})
}

func mustJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return `{"ok":false,"error":"json marshal failed"}`
	}
	return string(b)
}
