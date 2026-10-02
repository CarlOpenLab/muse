# 测试脚本

| 脚本               | 用途                                                 | 运行                              |
| ---------------- | -------------------------------------------------- | ------------------------------- |
| `test-agent.mjs` | agent loop 核心解析逻辑单测（SSE → tool\_calls，纯 Node，无需浏览器） | `node scripts/test-agent.mjs`   |
| `dev.mjs`        | 一键开发：并行启动 vite dev server + `go run ./muse-go`       | `pnpm dev`                      |

说明：`agent-test-entry.ts` 是 `test-agent.mjs` 的打包入口（被测源码来自 `src/`）。

> 原基于 Electron 的 e2e 冒烟脚本（`e2e-agent.mjs` / `e2e-typora.mjs`）随主壳迁移移除，
> 需要时可在 git 历史中找回；面向 MyGo/WebView 的自动化待补。
