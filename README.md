<p align="center">
  <img src="resources/icon.png" alt="Muse" width="128" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Muse-WYSIWYG%20Markdown%20Editor-88c0d0" alt="Muse" />
</p>

<h1 align="center">Muse</h1>

<p align="center">
  <strong>WYSIWYG Markdown 桌面编辑器</strong> · Shiki 实时高亮 · Go (MyGo) + Vue 3
</p>

<p align="center">
  <a href="#-功能特性"><img src="https://img.shields.io/badge/文档-中文-blue" alt="中文"></a>
  <a href="#-features"><img src="https://img.shields.io/badge/README-English-blue" alt="English"></a>
  <img src="https://img.shields.io/badge/MyGo-Go%20%2B%20WebView-00ADD8" alt="MyGo">
  <img src="https://img.shields.io/badge/Vue-3.5-42B883" alt="Vue 3.5">
  <img src="https://img.shields.io/badge/Milkdown-7-2E3440" alt="Milkdown 7">
  <img src="https://img.shields.io/badge/Shiki-4-1F2328" alt="Shiki 4">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

<p align="center">
  <a href="#-中文文档">🇨🇳 中文文档</a> ·
  <a href="#-english-docs">🇬🇧 English Docs</a>
</p>

***

# 🇨🇳 中文文档

一个**所见即所得（WYSIWYG）的 Markdown 桌面编辑器**：打字时 `#` 立刻变成标题、`**加粗**` 即时生效、代码块用 **Shiki** 实时语法高亮。基于 **Milkdown 7**（ProseMirror）构建，未来计划接入 **AI 流式输出**（Muse 的真正主线）。

## ✨ 功能特性

* **所见即所得** — Milkdown 7 内核，边打字边渲染 Markdown（标题 / 加粗 / 列表 / 引用 / 表格 / 任务列表等）
* **Typora 式交互对齐** — 第一版对齐目标：
  * **快捷键** — ⌘1-6 标题 / ⌘0 正文 / ⌘= ⌘- 标题升降级 / ⌘B ⌘I 加粗斜体 / ⌘⇧` 行内代码 / ⌃⇧` 删除线 / ⌘K 链接 / ⌘\ 清除格式 / ⌘⌥Q 引用 / ⌘⌥U ⌘⌥O 列表 / ⌘⇧X 任务列表 / ⌘⌥C 代码块 / ⌘⌥B 数学块 / ⌘⌥T 表格 / ⌘] ⌘[ 列表缩进（与 Typora macOS 默认一致）
  * **原生菜单** — 「段落」「格式」「视图」菜单结构与 Typora 对齐
  * **右键菜单** — 编辑器内右键：剪贴板 + 行内格式 + 段落 + 表格行列操作（表格内自动追加「插入/删除行列」）
  * **文件夹 / 文件树侧栏** — 底部工具条「打开文件夹」按钮（或文件 > 打开文件夹… ⌘⇧O、把文件夹拖进窗口），选中即展开左侧 Typora 式文件树：点击打开、当前文件高亮、右键新建文件/文件夹、重命名、移到废纸篓、Finder 显示；外部增删自动刷新（⌘⇧L 或底部工具条切换侧栏）
  * **表格编辑** — ⌘⌥T 插入表格；右键增删行列 / 删除表格；Tab / ⇧Tab 跳格
  * **数学公式** — `$…$` 行内、`$$…$$` 块级（remark-math 解析 + KaTeX 渲染），点击公式可编辑；输入 `$$` 回车即转公式块
  * **图片粘贴 / 拖拽** — 粘贴或拖入图片自动拷贝到文档同目录 `assets/` 并以相对路径插入（Typora 行为）；⌘⌃I / 右键选文件插入
  * **源代码模式** — ⌘/ 在所见即所得与 markdown 原文间切换，双向同步
  * **专注模式 / 打字机模式** — F8 压暗非当前段落；F9 光标保持屏幕约 45% 高度
  * **导出** — 文件 > 导出 PDF（含正文样式）/ 导出 HTML（独立样式文件，图片相对路径可用）
  * **智能粘贴** — 选中有文字时粘贴纯 URL 直接变成链接
* **Shiki 代码高亮** — 打字即时变色，采用 ProseMirror inline decoration 方案，光标完全原生、不跳动
  * 26 种常用语言按需加载（lazy chunk）
  * 代码块右上角可直接编辑语言标记
  * 明暗主题联动（`github-light` / `github-dark`）
* **明暗主题** — 一键切换，CSS 变量驱动，持久化到本地
* **辅助侧栏（大纲 | AI）** — 同一侧栏位置切换：大纲（标题树 + 点击平滑跳转 + 当前章节高亮）/ AI 对话（会话切换 + 流式回答 + 「引用当前文档」上下文 + 「插入到正文」 + 「替换选中」），编辑器常驻主区域，侧栏可拖拽调宽、收起
* **AI 工具调用（Agent）** — 用自然语言说明文档问题，AI 通过工具直接修改文档（读取 / 替换选中 / 光标插入 / 文末追加 / 全文替换），⌘Z 可撤销；选中文字时出现「润色 / 扩写 / 总结 / 翻译」快捷操作条
* **查找替换** — ⌘F 打开、⌘G / ⇧⌘G 上一个/下一个，匹配高亮
* **字数统计** — 底部状态栏实时显示
* **设置面板** — 字号 / 行高，实时生效并持久化
* **文件管理** — 打开 / 保存 / 另存为 / 新建，原生菜单 + 快捷键（⌘N / ⌘O / ⌘S / ⌘⇧S）
  * 拖拽打开文件
  * 最近文件列表
  * 未保存标记（●）+ 关闭确认
  * 自动保存（Typora / Obsidian 式防抖落盘）

> 📌 截图占位：后续补充

## 🧱 技术栈

| 层     | 选型                                             |
| ----- | ---------------------------------------------- |
| 外壳    | MyGo（Go 1.27 + 系统 WebView + 类型安全 IPC）           |
| 构建    | Vite 7（前端 HMR；`pnpm dev` 并行起前端与 Go 窗口）          |
| UI    | Vue 3.5 + TypeScript + UnoCSS                  |
| 编辑器内核 | Milkdown 7（基于 ProseMirror，commonmark + GFM 预设） |
| 代码高亮  | Shiki 4（单例 highlighter + inline decoration）    |
| 分发    | 单二进制（`pnpm build:go`）；mygo build 打包待配置         |

## 🚀 快速开始

```bash
pnpm install
pnpm dev           # 一键开发：vite dev server + go run（MyGo 窗口，前端 HMR）
```

其他常用命令：

```bash
pnpm typecheck     # 类型检查（vue-tsc）
pnpm build         # = build:go：前端产物 + muse-go/Muse 单二进制（~18MB）
pnpm build:web     # 仅前端 → muse-go/frontend/dist
pnpm test:e2e      # e2e 冒烟（构建 + 启动应用跑 21 项断言，需图形界面）
pnpm test:agent    # agent loop 解析逻辑单测（纯 Node）
```

调试：`pnpm dev` 时「视图 > 开发者工具」（⌥⌘I）打开 Web Inspector（前端 Console / Network）；
详见 [muse-go/README.md](./muse-go/README.md#调试)。

### GitHub Actions 发布

推送与 `package.json` 版本一致的标签（例如 `v0.1.2`）即可自动构建各平台单二进制并发布：

```bash
git tag v0.1.2
git push origin v0.1.2
```

工作流位于 `.github/workflows/release.yml`。它在 macOS / Windows / Linux runner 上各自执行 `pnpm build:web` + `go build`，产出对应平台的可执行文件并上传到同一个 GitHub Release。仓库的 Actions 设置需要允许 workflow 写入 Releases（工作流已声明 `contents: write` 权限）。

## 📁 目录结构

```
muse/
├── muse-go/                  # 主进程（Go + MyGo）
│   ├── main.go               # 窗口生命周期 / Typora 菜单 / 快捷键
│   ├── services/             # files / ai / export / appsvc（含全部 Go→前端事件）
│   └── frontend/dist         # pnpm build:web 产物（go:embed 内嵌）
├── src/                      # 前端（Vue 3）
│   ├── App.vue               # 应用骨架（侧栏 / 画布 / 状态栏）
│   ├── platform/mygoBridge.ts# window.muse 桥（IPC 通道 → Go 服务方法）
│   ├── editor/               # 编辑器
│   │   ├── MilkdownCore.vue  # Milkdown 装配（commonmark + GFM + 插件）
│   │   ├── codeBlockView.ts  # 代码块 node view（语言输入框）
│   │   ├── searchPlugin.ts   # 查找替换 ProseMirror 插件
│   │   └── shiki/            # Shiki 单例 + inline decoration 高亮
│   ├── components/           # 大纲侧栏 / 查找栏 / 状态栏 / 设置面板
│   ├── composables/          # 文件 / 主题 / 搜索 / 设置 / 统计 / 大纲
│   └── styles/base.css       # 主题变量 + 编辑器排版
├── resources/                # 应用图标
├── vite.web.config.ts        # 前端构建配置
└── uno.config.ts             # UnoCSS 配置
```

## 🗺️ 项目进度

| 阶段      | 内容                              | 状态    |
| ------- | ------------------------------- | ----- |
| Phase 0 | Vite + Vue 3 + TS 脚手架            | ✅     |
| Phase 1 | Milkdown 编辑器内核（WYSIWYG）         | ✅     |
| Phase 2 | Shiki 代码块实时高亮                   | ✅     |
| Phase 3 | 文件 I/O 与应用外壳（菜单 / 拖拽 / 最近文件）    | ✅     |
| Phase 4 | 编辑体验打磨（主题 / 大纲 / 查找 / 统计 / 设置）  | ✅     |
| Phase 4.5 | **Typora 交互对齐**（快捷键 / 段落与格式菜单 / 右键菜单 / 表格编辑 / 数学公式 / 图片粘贴 / 源代码模式 / 专注与打字机 / 导出 PDF·HTML） | ✅ |
| Phase 5 | AI 流式输出（`@shikijs/stream`，未来主线） | ⏳ 规划中 |
| Phase 4.6 | **主壳迁移 MyGo**（Go + 系统 WebView 替换 Electron，前端与 IPC 通道复用） | ✅ |

单测：`pnpm test:agent`（agent loop 解析逻辑）；e2e 冒烟：`pnpm test:e2e`（MyGo 版，构建后启动应用跑 21 项 DOM/IPC 断言，需图形界面）。原 Electron 版 e2e 脚本已随主壳迁移移除，可在 git 历史中找回。

详见 [PLAN.md](./PLAN.md)。

## 📄 License

[MIT](./LICENSE)

***

# 🇬🇧 English Docs

**Muse** is a **WYSIWYG Markdown editor** for the desktop. Type `#` and it becomes a heading; `**bold**` renders instantly; code blocks are highlighted in real time with **Shiki**. Built on **Milkdown 7** (ProseMirror), with AI streaming output planned as the project's true north.

## ✨ Features

* **WYSIWYG editing** — powered by Milkdown 7; headings, bold, lists, quotes, tables, task lists render as you type
* **Typora-style interaction parity** — first-milestone goal:
  * **Shortcuts** — ⌘1-6 headings / ⌘0 paragraph / ⌘= ⌘- promote & demote heading / ⌘B ⌘I bold & italic / ⌘⇧` inline code / ⌃⇧` strikethrough / ⌘K link / ⌘\ clear formatting / ⌘⌥Q quote / ⌘⌥U ⌘⌥O lists / ⌘⇧X task list / ⌘⌥C code fence / ⌘⌥B math block / ⌘⌥T table / ⌘] ⌘[ list indent (matches Typora macOS defaults)
  * **Native menus** — Paragraph / Format / View menus mirror Typora
  * **Context menu** — right-click inside the editor: clipboard + inline formatting + paragraph + table row/column ops (table ops appear automatically inside tables)
  * **Folder / file-tree sidebar** — the status-bar Open Folder button (or File > Open Folder… ⌘⇧O, or drop a folder onto the window) opens a Typora-style file tree on the left: click to open, active-file highlight, right-click for new file/folder, rename, move to trash, reveal in Finder; external changes refresh automatically (⌘⇧L or the status-bar button toggles the sidebar)
  * **Table editing** — ⌘⌥T to insert; right-click to add/remove rows & columns; Tab / ⇧Tab to jump cells
  * **Math** — `$…$` inline and `$$…$$` block (remark-math parsing + KaTeX rendering), click a formula to edit it; type `$$` + Enter to convert a paragraph
  * **Image paste / drop** — pasted or dropped images are copied into an `assets/` folder next to the document and inserted with a relative path (Typora behavior); ⌘⌃I or right-click to pick a file
  * **Source code mode** — ⌘/ toggles between WYSIWYG and raw markdown, synced both ways
  * **Focus / typewriter mode** — F8 dims all but the current paragraph; F9 keeps the caret at ~45% viewport height
  * **Export** — File > Export PDF (styled) / HTML (standalone file; relative image paths work)
  * **Smart paste** — pasting a plain URL over a selection turns it into a link
* **Shiki code highlighting** — instant coloring via ProseMirror *inline decorations*; the caret stays native and never jumps
  * 26 common languages loaded on demand (lazy chunks)
  * Editable language tag at the top-right corner of each code block
  * Theme-aware (`github-light` / `github-dark`)
* **Light / dark themes** — one-click toggle, CSS-variable driven, persisted locally
* **Outline sidebar** — heading tree with smooth scroll-to navigation and current-section highlight
* **Find & replace** — ⌘F to open, ⌘G / ⇧⌘G for prev/next, highlighted matches
* **Word count** — live stats in the status bar
* **Settings panel** — font size / line height, applied instantly and persisted
* **File management** — open / save / save as / new; native menus and shortcuts (⌘N / ⌘O / ⌘S / ⌘⇧S)
  * Drag & drop to open files
  * Recent files list
  * Unsaved marker (●) + close confirmation
  * Auto-save (debounced, Typora / Obsidian style)

> 📌 Screenshot placeholder — to be added.

## 🧱 Tech Stack

| Layer             | Choice                                                      |
| ----------------- | ----------------------------------------------------------- |
| Shell             | MyGo (Go 1.27 + system WebView + type-safe IPC)             |
| Build             | Vite 7 (frontend HMR; `pnpm dev` runs vite + the Go window) |
| UI                | Vue 3.5 + TypeScript + UnoCSS                               |
| Editor core       | Milkdown 7 (ProseMirror, commonmark + GFM presets)          |
| Code highlighting | Shiki 4 (singleton highlighter + inline decorations)        |
| Distribution      | Single binary (`pnpm build:go`); `mygo build` packaging TBD |

## 🚀 Quick Start

```bash
pnpm install
pnpm dev           # vite dev server + go run (MyGo window, frontend HMR)
```

Other scripts:

```bash
pnpm typecheck     # type checking (vue-tsc)
pnpm build         # = build:go: frontend bundle + muse-go/Muse single binary (~18MB)
pnpm build:web     # frontend only → muse-go/frontend/dist
pnpm test:e2e      # e2e smoke (build + launch the app, 21 assertions; needs a GUI)
pnpm test:agent    # agent-loop parsing unit tests (plain Node)
```

Debugging: under `pnpm dev`, View > Developer Tools (⌥⌘I) opens the Web Inspector
(frontend console / network). See [muse-go/README.md](./muse-go/README.md#调试) (Chinese).

### GitHub Actions Releases

Push a tag matching the version in `package.json` (for example, `v0.1.2`) to build and publish per-platform single binaries automatically:

```bash
git tag v0.1.2
git push origin v0.1.2
```

The workflow is `.github/workflows/release.yml`. On macOS / Windows / Linux runners it runs `pnpm build:web` + `go build` and uploads the resulting executables to one GitHub Release. Repository Actions settings must allow workflows to write Releases (the workflow requests `contents: write`).

## 📁 Project Structure

```
muse/
├── muse-go/                  # main process (Go + MyGo)
│   ├── main.go               # window lifecycle / Typora menus / shortcuts
│   ├── services/             # files / ai / export / appsvc (all Go→frontend events)
│   └── frontend/dist         # pnpm build:web output (embedded via go:embed)
├── src/                      # frontend (Vue 3)
│   ├── App.vue               # app shell (sidebar / canvas / status bar)
│   ├── platform/mygoBridge.ts# window.muse bridge (IPC channel → Go service method)
│   ├── editor/               # editor
│   │   ├── MilkdownCore.vue  # Milkdown wiring (commonmark + GFM + plugins)
│   │   ├── codeBlockView.ts  # code block node view (language input)
│   │   ├── searchPlugin.ts   # find & replace ProseMirror plugin
│   │   └── shiki/            # Shiki singleton + inline decoration highlight
│   ├── components/           # outline sidebar / search bar / status bar / settings
│   ├── composables/          # file / theme / search / settings / stats / outline
│   └── styles/base.css       # theme variables + editor typography
├── resources/                # app icons
├── vite.web.config.ts        # frontend build config
└── uno.config.ts             # UnoCSS config
```

## 🗺️ Roadmap

| Phase | Scope                                                       | Status    |
| ----- | ----------------------------------------------------------- | --------- |
| 0     | Vite + Vue 3 + TS scaffold                                  | ✅         |
| 1     | Milkdown editor core (WYSIWYG)                              | ✅         |
| 2     | Shiki real-time code highlighting                           | ✅         |
| 3     | File I/O & app shell (menus / drag-drop / recents)          | ✅         |
| 4     | Editing polish (themes / outline / find / stats / settings) | ✅         |
| 5     | AI streaming output (`@shikijs/stream`, the main line)      | ⏳ planned |
| 4.6   | **Shell migrated to MyGo** (Go + system WebView replacing Electron) | ✅ |

See [PLAN.md](./PLAN.md) for details.

## 📄 License

[MIT](./LICENSE)
