# Changelog

## Unreleased

- Rework the AI assistant around reading before writing and proposing changes for review. New tools: `editor_get_outline`, `editor_read` (paged or per-section), `editor_find`; all writes go through `editor_propose_edit`, which shows a diff card you confirm before anything lands in the document. / 重构 AI 助手：先读后写、改动先提议。新增 `editor_get_outline` / `editor_read`（分页或按章节）/ `editor_find`；所有正文改动统一走 `editor_propose_edit`，先出 diff 卡片、确认后才写入。
- Add an agent system prompt and context assembly (role, tool discipline, when to use which tool). / 新增 agent 系统提示词与上下文拼装（角色、工具纪律、工具选择）。
- Fix AI stream robustness: malformed tool arguments no longer break the whole stream, tool-call `id`/`name` are no longer double-appended, a tool round keeps the assistant's own text, and hitting the round cap ends with a visible notice. / 修复 AI 流健壮性：坏参数不再中断整条流，工具调用 id/name 不再重复拼接，工具轮保留模型正文，轮次用尽会给出明确收尾。
- Add pure-logic unit tests for the agent layer (`npm run test:agent`). / 为 agent 层补上纯逻辑单测（`npm run test:agent`）。

## 0.2.3

- Fix laggy title editing with IME: the composing text is no longer written back to the textarea, the title model only commits after composition ends, and Enter during composition no longer renames the file. / 修复标题输入法卡顿：组合输入期间不再回写输入框内容，标题仅在组合结束后提交，组合中按回车不再触发文件名同步。

## 0.2.2

- Switch the left sidebar between the file tree and the current document's outline. / 左侧栏可在文件树与当前文档大纲之间切换。
- Editing the document title renames the file to match it. / 标题编辑完成后，文件名跟随标题。
- Drop third-party editor names from the code, docs and package description. / 代码、文档与包描述中去掉外部编辑器的名字。

## 0.2.1

- Add signed automatic updates: daily background checks, release notes, download progress, install and restart, and optional automatic downloads. / 新增签名自动更新：每天后台检查，查看更新说明、下载进度、安装并重启，可选择自动下载安装。
- Add Magpie local gateway preset and discover models through `/v1/models`, preserving custom model IDs on refresh. / 新增 Magpie 本地网关预设，自动获取模型，刷新时保留自定义 ID。
- Wrap long document titles and tokens, widen the responsive editor, and keep tables within the page. / 修复长标题截断，优化正文宽度、长链接与表格换行。
- Load the Muse logo explicitly in the Dock. / Dock 显式加载 Muse Logo。

Install 0.2.1 manually once if upgrading from 0.2.0; future versions can update in the app. macOS builds support Apple Silicon; Windows and Linux builds support x64. / 从 0.2.0 升级需手动安装一次 0.2.1，后续可在应用内更新。macOS 支持 Apple Silicon，Windows 与 Linux 支持 x64。
