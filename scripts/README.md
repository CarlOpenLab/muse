# 测试脚本

| 脚本               | 用途                                                 | 运行                              |
| ---------------- | -------------------------------------------------- | ------------------------------- |
| `test-agent.mjs` | agent loop 核心解析逻辑单测（SSE → tool\_calls，纯 Node，无需浏览器） | `node scripts/test-agent.mjs`   |
| `e2e-muse.mjs`   | MyGo 版 e2e 冒烟：构建 → `MUSE_E2E=1` 启动应用 → 收集页面注入断言的 `E2E_RESULT`（需图形界面） | `pnpm test:e2e`                 |
| `dev.mjs`        | 一键开发：并行启动 vite dev server + `go run -C native .`     | `pnpm dev`                      |

说明：`agent-test-entry.ts` 是 `test-agent.mjs` 的打包入口（被测源码来自 `app/src/`）。
`e2e-muse.mjs` 的断言脚本内嵌在 Go 侧（`native/e2e/assertions.js`，经 `go:embed` 打进二进制），
由 `native/e2e.go` 在 `MUSE_E2E=1` 时注入页面并打印 `E2E_RESULT` 一行 JSON。

> 原基于 Electron 的 e2e 冒烟脚本（`e2e-agent.mjs` / `e2e-typora.mjs`）随主壳迁移移除，
> 需要时可在 git 历史中找回；面向 MyGo/WebView 的自动化已由 `e2e-muse.mjs` 接替。
