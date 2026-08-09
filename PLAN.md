# Muse · 规划文档 v1

> 目标：做一个 Electron 桌面应用，第一版实现 **markdown 即时渲染（WYSIWYG）**，
> 代码块用 **Shiki** 高亮；并为后续 **AI 流式输出**（项目名 Muse 的真正含义）打好地基。

---

## 0. 关键认知校正（避免选型跑偏）

| 组件 | 实际能力 | 在本项目中的角色 |
|------|----------|------------------|
| `shiki` | 代码语法高亮器（只染代码块） | 代码块染色 |
| `@shikijs/stream` | **LLM 流式输出**的增量高亮 | 未来 AI 流式生成代码时用，**不是** WYSIWYG 引擎 |
| `@shikijs/rehype` | 把 Shiki 接进 unified/remark 管道 | 渲染静态 markdown 预览/AI 输出预览 |
| markdown 解析/序列化 | markdown ⇄ 富文本 | 由编辑器内核（Milkdown）承担 |

**结论**：「边打字边渲染」由 **编辑器内核** 负责，Shiki 只在代码块这一层介入。

---

## 1. 技术栈（推荐）

| 层 | 选型 | 理由 |
|----|------|------|
| 外壳 | **Electron 43** | 桌面端、文件系统、原生菜单 |
| 构建 | **electron-vite 5** | HMR 快、main/preload/renderer 一体化 |
| UI 框架 | **Vue 3 + TypeScript** | 生态成熟，`@milkdown/vue` 官方适配，做工具栏/侧栏顺手 |
| 编辑器内核 | **Milkdown 7**（基于 ProseMirror） | 开箱即 WYSIWYG markdown，自带 commonmark/GFM 预设与序列化 |
| 代码高亮 | **Shiki 4**（单例 highlighter） | 代码块染色，主题精美 |
| AI 流式高亮（未来） | **@shikijs/stream 4** | 流式 token 增量染色，不阻塞 |
| 状态管理 | Zustand | 轻量 |
| 打包 | electron-builder | macOS dmg / Windows nsis / Linux AppImage |
| 样式 | CSS + CSS 变量（主题系统） | 编辑器对排版精细度要求高，Tailwind 反而碍事 |

> **备选内核**：若想更可控、社区更大，可用 **TipTap + tiptap-markdown**，但 markdown 序列化和快捷键要自己补，v1 工作量更大。
> **最简备选**（非 WYSIWYG）：CodeMirror 6 + 实时预览分栏。但那就不是 WYSIWYG 了，仅作降级方案。

---

## 2. 目录结构

```
muse/
├── electron/                    # 主进程
│   ├── main.ts                  # 生命周期 / 窗口 / 菜单
│   ├── preload.ts               # 安全 IPC 桥（contextIsolation）
│   └── services/
│       └── fs.ts                # 打开/保存/最近文件 IPC
├── src/                         # 渲染进程
│   ├── main.ts
│   ├── App.vue
│   ├── editor/
│   │   ├── MilkdownEditor.vue  # 编辑器宿主
│   │   ├── shiki/
│   │   │   ├── highlighter.ts   # Shiki 单例 + 主题切换
│   │   │   ├── codeBlockView.ts # Milkdown 代码块 node view（Shiki 染色）
│   │   │   └── stream.ts        # @shikijs/stream 封装（AI 阶段）
│   │   └── plugins/             # Milkdown 插件（快捷键、粘贴等）
│   ├── components/              # 工具栏 / 大纲 / 标签页
│   ├── store/                   # zustand
│   └── styles/
├── resources/                   # 图标
├── electron-builder.yml
├── vite.config.ts
└── package.json
```

---

## 3. 架构要点

- **安全**：`contextIsolation: true`、`nodeIntegration: false`，所有文件操作走 preload IPC。
- **Shiki 单例**：启动时 `createHighlighter`（异步，加载 wasm/语法），之后 `codeToHtml` 近乎同步。避免每块重复初始化。
- **代码块 node view**：Milkdown 的 fenced-code 节点用自定义 node view，把 Shiki HTML 渲染进去。
  - v1 策略：**编辑中显示纯文本，失焦/防抖时重新高亮**（避免光标跳动）。这也是「块级聚焦」思路的简化。
  - 增强：把 Shiki 丢进 **Web Worker**，打字时不阻塞主线程。
- **主题系统**：CSS 变量驱动，Shiki 主题与编辑器主题联动（如 `github-light` / `github-dark`）。

---

## 4. 里程碑

### Phase 0 · 脚手架（≈0.5 天）✅
- [x] electron-vite + Vue 3 + TS 跑通，main/preload/renderer 三端构建通过（typecheck ✅ build ✅）
- [x] contextIsolation 安全配置（nodeIntegration off，IPC 走 preload 桥）
- [x] 基础窗口骨架（菜单/快捷键留 Phase 3）

### Phase 1 · 编辑器内核（≈1–2 天）✅
- [x] 接入 Milkdown（commonmark + GFM 预设 + Nord 主题 + history/clipboard/listener 插件）
- [x] markdown 读入/写出（`@milkdown/utils` 的 `replaceAll` + `listenerCtx.markdownUpdated` 双向同步）
- [x] 打字即渲染的 WYSIWYG 基本可用（运行时验证：打字 `##`/`**` 即时变标题/加粗，v-model 回环正常）

### Phase 2 · Shiki 代码块（≈1–2 天）⭐ 核心难点 ✅
- [x] Shiki 单例 highlighter（`shiki/core` + 纯 JS 引擎，26 语言按需 lazy chunk，github-light 主题）
- [x] ProseMirror inline decoration 把 token 颜色叠加到 `code_block` 文本（光标原生、打字即时高亮）
- [x] 切词结果按 `${theme}\0${lang}\0${text}` 缓存（主题入键）；字符对齐校验后才着色
- [x] 代码块容器 CSS（等宽字体 / 圆角 / 背景）
- [x] **明暗双主题**（CSS 变量 + Shiki `github-light`/`github-dark` 联动，提前实现）
- [ ] 行内代码样式微调（留 Phase 4）

> 运行时验证：冒烟测试显示 `shiki: loaded 59 langs` + `shiki decorations: 53`
> （js/ts/python 三块共 53 着色），无报错。
> 打包：28 chunk / 3.8MB（较 bundle-full 的 309 chunk / 11MB 大幅瘦身）。

### Phase 3 · 文件与应用外壳（≈1 天）✅
- [x] IPC：打开 / 保存 / 另存为 / 新建（fs:open / fs:openPath / fs:save / fs:saveAs）
- [x] 最近文件（userData/recent.json，菜单子项动态重建）、窗口标题=文件名、未保存标记（● 前缀）
- [x] 原生菜单 + 快捷键（⌘N / ⌘O / ⌘S / ⌘⇧S）+ 关闭未保存确认框
- [x] 拖拽打开文件（`webUtils.getPathForFile`）

> 运行时验证：诊断确认 `document.title` / `getPathForFile` / `fs:readRecent` 端到端，
> Milkdown 渲染 383 字符 + 3 代码块。

### Phase 4 · 编辑体验打磨（≈2–3 天）✅
- [ ] 块级聚焦（仅当前编辑块显示 markdown 标记）—— **v1 未做**：Milkdown 实现需为每种节点做「源码态/渲染态」双视图 node view，成本极高且易破坏现有 WYSIWYG，留 v2 单独攻坚
- [x] 明暗主题 + GitHub 风格（提前实现，见 Phase 2 末）
- [x] 大纲侧栏（标题树 + 点击跳转） / 字数统计（底部状态栏） / 查找替换（⌘F，ProseMirror decoration + $command）
- [x] 自动保存与草稿持久化（未命名文档防抖写 userData/draft.json，启动恢复）
- [x] 设置面板（字号 / 行高 / 编辑区宽度，localStorage 持久化 + CSS 变量）

> 运行时验证：大纲 2 项 + h1/h2 正确；状态栏 137 字；查找替换 matches 2 + 计数 1/2；
> 设置面板打开 + 字号变量生效 + 编辑区 max-width 820px。

### Phase 5 · AI 流式输出（未来，Muse 真正主线）
- [ ] AI 侧栏：流式接收模型 markdown/代码 token
- [ ] **@shikijs/stream** 增量高亮流式代码，不每 token 全量重算
- [ ] **@shikijs/rehype** 渲染流式 markdown 预览
- [ ] 一键插入 AI 结果到正文

---

## 5. 风险与决策

| 风险 | 说明 | 对策 |
|------|------|------|
| Milkdown + Shiki 自定义 node view | 最 tricky，重高亮时光标易跳 | 失焦/防抖重高亮；必要时 Worker 化 |
| Shiki 体积 | 全语言包很大 | fine-grained 按需引入常用语言；或主进程/Worker 跑 |
| 「块级聚焦」 | 高级特性，实现复杂 | v1 可先全渲染，Phase 4 再做 |
| 编辑器内核二选一 | Milkdown 上手陡但 WYSIWYG 开箱即用；TipTap 灵活但要自己补 markdown | 推荐 Milkdown，待你拍板 |

---

## 6. 决策记录

- ✅ UI 框架：**Vue 3 + TypeScript**（`@milkdown/vue` 官方适配）
- ✅ 编辑器内核：**Milkdown**（commonmark + GFM + Nord）
- ⏳ v1 范围：建议做到 Phase 4，AI 留 v2 -- 待确认
- ✅ Phase 0 脚手架：完成
- ✅ Phase 1 编辑器内核：完成
- ✅ Phase 2 Shiki 代码块：完成（ProseMirror decoration 方案，非 node view）
- ✅ Phase 3 文件与应用外壳：完成（IPC + 原生菜单 + 拖拽 + 最近文件 + 关闭确认）
- ✅ Phase 4 体验打磨：大纲 / 字数 / 查找替换 / 草稿自动保存 / 设置面板；块级聚焦留 v2
- ✅ 布局演进：编辑器常驻主区域，右侧辅助侧栏同一位置「大纲 | AI」标签切换（Notion AI 式写作辅助）；
  AI 面板支持会话下拉切换、「引用当前文档」上下文注入、「插入到正文」（markdown 解析后落到光标处）
- ✅ AI 直接编辑文档：选区跟踪插件（ProseMirror selection → 模块级快照）→ 侧栏「已选中 N 字」操作条（润色 / 扩写 / 总结 / 翻译快捷动作），
  发送时选中文本注入 system 上下文并记录目标选区，回答完成后「替换选中」按 markdown 解析直接替换原文（带原文一致性校验，防误删）
- ✅ **Agent 工具调用**：侧栏 AI 用自然语言说明文档问题，模型通过 OpenAI function calling 直接修改文档（get_document / get_selection / replace_selection / insert_at_cursor / insert_at_end / replace_text 六工具）；
  ipcChatFetch 内 agent loop 逐轮请求 → 流中解析 tool_calls → dispatchEditorTool 执行（MilkdownCore transaction，⌘Z 可撤销）→ 结果反馈下一轮；
  输出流只保留 content，UI/x-sdk 层无感；mock 模式带工具演示（可一键验证全链路）；「AI 可修改文档」开关在对话选项中

> 验证：`npm run test:agent`（解析逻辑 12 项单测）+ `npm run test:e2e`（真实构建产物端到端：UI 发送工具意图 → 文档真实追加内容）
- ✅ **@antdv-next/x 组件化**：思考链（深度思考 reasoning_content 流式 + 工具调用 loading→success|error）用 `ThoughtChain` 渲染（chainStore 模块级数据，agent loop 写入）；
  消息操作（复制 / 插入正文 / 替换选中 / 重新生成）用 `Actions` + `ActionsCopy`；`Sender` / `Bubble` / `Welcome` / `Conversations` / `XMarkdown` / `CodeHighlighter` 全覆盖；
  ipcProvider 统一为「解析→转发」核心：普通聊天与 agent 模式同路径，思考链在所有模式可用

> 环境备注：npm 开了 `allow-scripts` 空白名单，已在 `package.json` 持久化批准
> `electron` / `esbuild` / `electron-winstaller` 的 postinstall，避免 `npm install` 清空二进制。
