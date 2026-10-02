# Muse · MyGo 版外壳

Muse 的运行外壳：**Go 后端 + 系统 WebView + 类型安全 IPC**（[MyGo](https://mygo.egoist.dev/)）。
Electron 版已移除，`muse-go/` 是唯一主进程实现。前端（`../src`）经
`src/platform/mygoBridge.ts` 桥接到 `window.muse` API，业务代码不感知外壳差异。

## 结构

```
muse-go/
├── main.go            窗口、Typora 菜单（含快捷键）、生命周期、外部「打开方式」
├── services/
│   ├── state.go       应用级共享状态 + 全部 Go→前端事件
│   ├── files.go       文件/对话框/最近文件/草稿/目录与文档监听
│   ├── ai.go          OpenAI 兼容流式对话 + Brave 搜索
│   ├── export.go      图片 assets/、PDF（win.PrintToPDF）、HTML 导出
│   └── appsvc.go      脏标记/关窗确认/打开路径握手
├── frontend/dist      pnpm build:web 的产物，go:embed 内嵌进二进制
└── mygo.config.ts     供 mygo build 打包分发用（dmg/签名/公证/自动更新）
```

## 开发（在仓库根目录）

```bash
pnpm dev         # 一键：并行起 vite dev server(:5173) + go run（推荐）

# 或分开跑：
pnpm dev:web     # 终端 1：vite dev server :5173
pnpm dev:go      # 终端 2：MYGO_DEV_URL=http://localhost:5173 go run ./muse-go
```

前端改动走 vite HMR 即时生效；Go 改动重启 `pnpm dev:go`。

## 构建

```bash
pnpm build       # = build:go：构建前端产物并产出 muse-go/Muse 单二进制（约 18MB，含前端）
pnpm build:web   # 仅前端（muse-go/frontend/dist）
pnpm build:go    # 同上，产出单二进制（CGO_ENABLED=0 + -ldflags="-s -w"）
```

需要调试符号时直接 `go build -o Muse .`（约 23MB）。
`mygo build`（dmg/签名/公证/自动更新）尚未配置。

## e2e 冒烟测试

```bash
pnpm test:e2e              # 构建后启动（MUSE_E2E=1），断言结果打在 stdout
node scripts/e2e-muse.mjs --no-build   # 用现有二进制直接跑
```

`muse-go/e2e.go` 在 MUSE_E2E=1 时把用户数据（含「文档」目录）指向一次性临时目录，
页面加载完成后注入 `muse-go/e2e/assertions.js`（21 项断言：编辑器挂载 / IPC 桥 /
标题 / 加粗 / 数学块与行内公式 / 表格与右键菜单 / 源代码模式 / 专注模式 / 列表与引用），
以 0/1 退出。需要图形界面（会短暂弹出窗口），不适合无头 CI。

## 已知待验行为（相对原 Electron 版）

- 中文 IME 在 WKWebView 的表现需实测（ProseMirror 在 WebKit 有已知 composition 差异）
- 拖拽打开文件：桥按文件名匹配原生 onFileDrop 的路径，两事件时序未验证
- 文件树排序：Go 按字节序（原 Electron 按 localeCompare(zh-CN) 拼音）
- 文件树 / 打开文件夹等对话框链路尚无自动化（e2e 目前不覆盖，需要可注入的选目录夹具）
