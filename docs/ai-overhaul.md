# AI 功能重构（Muse 0.2.x → 未发布）

这一轮只做 AI 相关的事，其余功能不动。目标是把「AI 改文档」从「盲改 + 不可见 + 容易崩」改成
**先读清楚再提议、改动有 diff 可确认、坏输入不炸流**。

## 旧版为什么拉胯（都是工程问题，不是模型问题）

1. **没有 agent 系统提示词**。请求里只有文档 / 选区 / 搜索三段上下文，模型不知道自己的角色、
   该怎么用工具、改动该走什么流程。结果经常只输出建议不动笔，或抓不准位置。
2. **工具只有 6 个，全是「盲改」**：`get_document / replace_selection / insert_at_cursor /
   insert_at_end / replace_text / get_selection`。没有大纲、没有按章节或按区间读，
   `get_document` 到 8000 字**静默截断**却被当全文用 → 长文档必然改错；
   `replace_text` 靠精确字符串匹配，差一个空格就失效。
3. **改动不可见、不可撤销**。工具直接落笔，没有 diff 预览与确认，只能事后 ⌘Z。
4. **健壮性 bug**：
   - `JSON.parse(tc.arguments)` 写在 `try` 之外 —— 参数不完整时整条流报错；
   - tool_call 增量用 `+=` 累加 `id/name` —— 端点若每条增量都带完整 id 就会重复拼接；
   - 工具轮把 assistant 的 `content` 写死为 `null` —— 模型「我准备改这三处」这类说明从历史里丢失；
   - `MAX_ROUNDS` 用尽后无声结束。

## 这轮改了什么

### 1. Agent 提示词与上下文（`app/src/chat/agent/prompt.ts`）
新增 `AGENT_SYSTEM_PROMPT`（角色 + 工具纪律 + 内容准则），由 `buildSystemMessages()` 在带工具时
注入到请求最前。明确要求：改动一律走 `editor_propose_edit`，不得用文字声称「已修改」；
改前先读；长文分页读；按目标类型选工具。

### 2. 新工具集（`app/src/chat/editorTools.ts` + `app/src/editor/editorToolHandlers.ts`）
「读」拆成三件、「写」收敛成一件，定位从「猜字符串」变成「按章节 id」：

| 工具 | 作用 |
| --- | --- |
| `editor_get_outline` | 列出标题层级、章节 id（`s3`…）与字符数；改结构前先看 |
| `editor_read` | 整篇（`offset`/`limit` 分页）或按 `section` 读；返回是否还有后续与下次的 offset |
| `editor_find` | 查找文本，返回次数、所在章节与上下文；多处命中会提示改用 section |
| `editor_get_selection` | 读当前选区（无选区时给光标附近上下文） |
| `editor_propose_edit` | **只提交改动提议**，不落笔：`target` = `section`/`text`/`selection`/`document_end`/`cursor` |

旧工具名仍被执行器认（避免历史调用报「未知工具」），但不再对外声明，且写类旧工具直接回「已废弃」。

### 3. 「提议 → diff → 确认」交互
- 写类工具算好 `目标区间 + 新内容 + 行级/词级 diff`，存成 proposal（`app/src/chat/proposals.ts`）。
- 侧栏输入框上方渲染确认卡片（`ProposalCard.vue`）：展示 diff、`+n/-n`、逐条「应用 / 放弃」。
- 点「应用」走**新的** `apply-proposal` 编辑器动作（`MilkdownCore.vue` + `useEditorControl.ts`）：
  **严格校验**原文快照是否仍一致；文档已变动则**失败**并提示「提议已失效」，**绝不退化成插入**
  （旧的 `replace-selection` 在失配时会退化成插入，会错插内容，所以没复用它）。
- agent loop 提交提议后**立即收尾**，等用户确认，不再空转后续轮次。

### 4. 健壮性修复（`app/src/chat/agent/toolCall.ts` + `ipcProvider.ts`）
- 参数解析拆成纯函数 `parseToolArguments()`：坏 JSON 返回错误结果给模型，**不再炸整条流**。
- `applyToolCallDelta()`：`id/name` 只取第一次，`arguments` 逐段拼接。
- `validateToolCall()`：缺 `id/name` 的调用不执行，回一条错误结果。
- 工具轮保留 assistant 的 `content`，不再丢模型的说明。
- 轮次用尽时给用户一句明确收尾。

## 纯逻辑单测

AI 的核心逻辑刻意做成**不依赖 Vue / ProseMirror 的纯模块**，因此可以真跑（此前前端没有任何测试）：

```bash
cd app && npm run test:agent   # tsc 编译 src/chat/agent → .tmp-agent-test，再 node --test
```

覆盖：行级/词级 diff（含大输入退化）、章节索引与分页读、参数解析与流式累加。

## 验证

- `npm run typecheck`（vue-tsc）通过
- `npx vite build` 通过
- `npm run test:agent` 23/23 通过

## 已知边界 / 后续

- 提议存的是**提议时**的 ProseMirror 位置；若用户在确认前编辑了文档，应用会失败并提示重新生成
  （安全但保守）。想更宽松可以按 `expectedText` 重新定位，属于后续优化。
- 同一区间重复提议只保留最新一条（`dedupeProposals`）。
- 仍未做：真正的「全量原生 UI」与插件热插拔（见 `docs/native-migration.md`）。