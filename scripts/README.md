# 测试脚本

| 脚本               | 用途                                                 | 运行                                               |
| ---------------- | -------------------------------------------------- | ------------------------------------------------ |
| `test-agent.mjs` | agent loop 核心解析逻辑单测（SSE → tool\_calls，无需 Electron） | `node scripts/test-agent.mjs`                    |
| `e2e-agent.mjs`  | 端到端：真实构建产物 + Electron，驱动 UI 发送工具意图消息，验证文档真实被修改     | 先 `npm run build` 再 `node scripts/e2e-agent.mjs` |

说明：`agent-test-entry.ts` 是 `test-agent.mjs` 的打包入口（被测源码来自 `src/`）。
