# editor-web — Muse 的 WebView 画布（RFC-001 目标方案）

正文编辑面是一个 Vue 3 + Milkdown/ProseMirror 页面，由 MyGo 原生窗口的
`ui.WebView` 元素承载（宿主见 `native/nativeui/webeditor.go`）。渲染即编辑、
没有"读态 ↔ 编辑态"切换，原生路线的点击跳变/闪烁从构造上不存在。

## 结构

- `src/app/` — Vue 壳：`App.vue` 挂载画布、接桥、无宿主时加载演示文档
- `src/milkdown/main.ts` — Milkdown 画布工厂（commonmark + gfm + history + math）
- `src/bridge/protocol.ts` — RFC-001 §5.2 桥协议消息（传输无关）
- `src/bridge/webBridge.ts` — Web 侧协议实现：revision 守卫、200ms 防抖，
  传输优先级 mygo runtime → WKScriptMessageHandler → 浏览器 harness
- `src/vditor/`、`src/poc.ts`、`poc.html` — M0/M0.5 PoC 对照页（`/poc.html`）
- `tests/` — vitest：协议语义 + mygo 传输层映射

## 桥

Go 侧 `mygo.BindAs("Muse", …)` 暴露 `Muse.Ready / DocumentChanged /
SaveRequested / SelectionChanged / OpenLink / ImagePaste / CommandReply`；
Go 事件 `muse:bridge` 携带 `document.set` / `theme.set` / `command` 载荷。
保存时 Go 发 `command{requestSave}`，画布回 `Muse.SaveRequested`，不依赖
最后一次防抖。

## 构建

```bash
npm install && npm run build   # 产物写入 native/nativeui/web/dist（embed）
npm test                       # vitest，13 用例
npm run dev                    # 5273 端口浏览器调试（无宿主自动演示文档）
```

`go build` 前先 `npm run build`（仓库内已带最新 dist，直接 go build 也可跑）。
真机环境变量：`MUSE_NATIVE_EDITOR=1` 强制全原生编辑器（回退）。

## 已验证

- 13/13 vitest：协议语义 + mygo 传输层映射
- 浏览器 E2E：点击 h1/h2/li 与 h1 内打字，所有块包围盒零变化
- Linux 沙箱：WebKitGTK 中 WebView 加载 embed 前端，渲染 Go 推送的文档

## 空内容占位符

`src/milkdown/placeholder.ts`：空标题「写下标题…」/ 全空「在此落笔…」/ 末尾
空段「继续书写…」，decoration + `::before` 绘制，颜色走 `--muse-muted`。
