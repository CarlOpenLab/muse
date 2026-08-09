<p align="center">
  <img src="resources/icon.png" alt="Muse" width="128" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Muse-WYSIWYG%20Markdown%20Editor-88c0d0" alt="Muse" />
</p>

<h1 align="center">Muse</h1>

<p align="center">
  <strong>WYSIWYG Markdown 桌面编辑器</strong> · Shiki 实时高亮 · Electron + Vue 3
</p>

<p align="center">
  <a href="#-功能特性"><img src="https://img.shields.io/badge/文档-中文-blue" alt="中文"></a>
  <a href="#-features"><img src="https://img.shields.io/badge/README-English-blue" alt="English"></a>
  <img src="https://img.shields.io/badge/Electron-43-47848F" alt="Electron 43">
  <img src="https://img.shields.io/badge/Vue-3.5-42B883" alt="Vue 3.5">
  <img src="https://img.shields.io/badge/Milkdown-7-2E3440" alt="Milkdown 7">
  <img src="https://img.shields.io/badge/Shiki-4-1F2328" alt="Shiki 4">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

<p align="center">
  <a href="#-中文文档">🇨🇳 中文文档</a> ·
  <a href="#-english-docs">🇬🇧 English Docs</a>
</p>

---

# 🇨🇳 中文文档

一个**所见即所得（WYSIWYG）的 Markdown 桌面编辑器**：打字时 `#` 立刻变成标题、`**加粗**` 即时生效、代码块用 **Shiki** 实时语法高亮。基于 **Milkdown 7**（ProseMirror）构建，未来计划接入 **AI 流式输出**（Muse 的真正主线）。

## ✨ 功能特性

- **所见即所得** — Milkdown 7 内核，边打字边渲染 Markdown（标题 / 加粗 / 列表 / 引用 / 表格 / 任务列表等）
- **Shiki 代码高亮** — 打字即时变色，采用 ProseMirror inline decoration 方案，光标完全原生、不跳动
  - 26 种常用语言按需加载（lazy chunk）
  - 代码块右上角可直接编辑语言标记
  - 明暗主题联动（`github-light` / `github-dark`）
- **明暗主题** — 一键切换，CSS 变量驱动，持久化到本地
- **大纲侧栏** — 标题树 + 点击平滑跳转 + 当前章节高亮
- **查找替换** — ⌘F 打开、⌘G / ⇧⌘G 上一个/下一个，匹配高亮
- **字数统计** — 底部状态栏实时显示
- **设置面板** — 字号 / 行高，实时生效并持久化
- **文件管理** — 打开 / 保存 / 另存为 / 新建，原生菜单 + 快捷键（⌘N / ⌘O / ⌘S / ⌘⇧S）
  - 拖拽打开文件
  - 最近文件列表
  - 未保存标记（●）+ 关闭确认
  - 未命名文档自动保存草稿，启动自动恢复

> 📌 截图占位：后续补充

## 🧱 技术栈

| 层 | 选型 |
|----|------|
| 外壳 | Electron 43 |
| 构建 | electron-vite 5（HMR，main / preload / renderer 一体化） |
| UI | Vue 3.5 + TypeScript + UnoCSS |
| 编辑器内核 | Milkdown 7（基于 ProseMirror，commonmark + GFM 预设） |
| 代码高亮 | Shiki 4（单例 highlighter + inline decoration） |
| 打包 | electron-builder（macOS dmg / Windows nsis / Linux AppImage + deb） |

## 🚀 快速开始

```bash
npm install
npm run dev        # 启动开发模式（HMR）
```

其他常用命令：

```bash
npm run typecheck  # 类型检查（vue-tsc）
npm run build      # 构建渲染产物到 out/
npm run preview    # 预览构建产物
npm run build:mac  # 打包 macOS dmg / zip
npm run build:win  # 打包 Windows nsis
npm run build:linux# 打包 Linux AppImage / deb
```

## 📁 目录结构

```
muse/
├── electron/                 # 主进程
│   ├── main.ts               # 窗口生命周期 / 原生菜单 / 快捷键
│   ├── preload.ts            # 安全 IPC 桥（contextIsolation）
│   └── services/fs.ts        # 打开 / 保存 / 最近文件 IPC
├── src/                      # 渲染进程
│   ├── App.vue               # 应用骨架（侧栏 / 画布 / 状态栏）
│   ├── editor/               # 编辑器
│   │   ├── MilkdownCore.vue  # Milkdown 装配（commonmark + GFM + 插件）
│   │   ├── codeBlockView.ts  # 代码块 node view（语言输入框）
│   │   ├── searchPlugin.ts   # 查找替换 ProseMirror 插件
│   │   └── shiki/            # Shiki 单例 + inline decoration 高亮
│   ├── components/           # 大纲侧栏 / 查找栏 / 状态栏 / 设置面板
│   ├── composables/          # 文件 / 主题 / 搜索 / 设置 / 统计 / 大纲
│   └── styles/base.css       # 主题变量 + 编辑器排版
├── resources/                # 应用图标
├── electron-builder.yml      # 打包配置
└── uno.config.ts             # UnoCSS 配置
```

## 🗺️ 项目进度

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 0 | electron-vite + Vue 3 + TS 脚手架 | ✅ |
| Phase 1 | Milkdown 编辑器内核（WYSIWYG） | ✅ |
| Phase 2 | Shiki 代码块实时高亮 | ✅ |
| Phase 3 | 文件 I/O 与应用外壳（菜单 / 拖拽 / 最近文件） | ✅ |
| Phase 4 | 编辑体验打磨（主题 / 大纲 / 查找 / 统计 / 设置） | ✅ |
| Phase 5 | AI 流式输出（`@shikijs/stream`，未来主线） | ⏳ 规划中 |

详见 [PLAN.md](./PLAN.md)。

## 📄 License

[MIT](./LICENSE)

---

# 🇬🇧 English Docs

**Muse** is a **WYSIWYG Markdown editor** for the desktop. Type `#` and it becomes a heading; `**bold**` renders instantly; code blocks are highlighted in real time with **Shiki**. Built on **Milkdown 7** (ProseMirror), with AI streaming output planned as the project's true north.

## ✨ Features

- **WYSIWYG editing** — powered by Milkdown 7; headings, bold, lists, quotes, tables, task lists render as you type
- **Shiki code highlighting** — instant coloring via ProseMirror *inline decorations*; the caret stays native and never jumps
  - 26 common languages loaded on demand (lazy chunks)
  - Editable language tag at the top-right corner of each code block
  - Theme-aware (`github-light` / `github-dark`)
- **Light / dark themes** — one-click toggle, CSS-variable driven, persisted locally
- **Outline sidebar** — heading tree with smooth scroll-to navigation and current-section highlight
- **Find & replace** — ⌘F to open, ⌘G / ⇧⌘G for prev/next, highlighted matches
- **Word count** — live stats in the status bar
- **Settings panel** — font size / line height, applied instantly and persisted
- **File management** — open / save / save as / new; native menus and shortcuts (⌘N / ⌘O / ⌘S / ⌘⇧S)
  - Drag & drop to open files
  - Recent files list
  - Unsaved marker (●) + close confirmation
  - Auto-saved drafts for untitled documents, restored on launch

> 📌 Screenshot placeholder — to be added.

## 🧱 Tech Stack

| Layer | Choice |
|-------|--------|
| Shell | Electron 43 |
| Build | electron-vite 5 (HMR, unified main / preload / renderer) |
| UI | Vue 3.5 + TypeScript + UnoCSS |
| Editor core | Milkdown 7 (ProseMirror, commonmark + GFM presets) |
| Code highlighting | Shiki 4 (singleton highlighter + inline decorations) |
| Packaging | electron-builder (macOS dmg / Windows nsis / Linux AppImage + deb) |

## 🚀 Quick Start

```bash
npm install
npm run dev        # launch dev mode with HMR
```

Other scripts:

```bash
npm run typecheck  # type checking (vue-tsc)
npm run build      # build renderer output to out/
npm run preview    # preview the build
npm run build:mac  # package macOS dmg / zip
npm run build:win  # package Windows nsis
npm run build:linux# package Linux AppImage / deb
```

## 📁 Project Structure

```
muse/
├── electron/                 # Main process
│   ├── main.ts               # window lifecycle / native menu / shortcuts
│   ├── preload.ts            # secure IPC bridge (contextIsolation)
│   └── services/fs.ts        # open / save / recent files IPC
├── src/                      # Renderer process
│   ├── App.vue               # app shell (sidebar / canvas / status bar)
│   ├── editor/               # editor
│   │   ├── MilkdownCore.vue  # Milkdown wiring (commonmark + GFM + plugins)
│   │   ├── codeBlockView.ts  # code block node view (language input)
│   │   ├── searchPlugin.ts   # find & replace ProseMirror plugin
│   │   └── shiki/            # Shiki singleton + inline decoration highlight
│   ├── components/           # outline sidebar / search bar / status bar / settings
│   ├── composables/          # file / theme / search / settings / stats / outline
│   └── styles/base.css       # theme variables + editor typography
├── resources/                # app icons
├── electron-builder.yml      # packaging config
└── uno.config.ts             # UnoCSS config
```

## 🗺️ Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | electron-vite + Vue 3 + TS scaffold | ✅ |
| 1 | Milkdown editor core (WYSIWYG) | ✅ |
| 2 | Shiki real-time code highlighting | ✅ |
| 3 | File I/O & app shell (menus / drag-drop / recents) | ✅ |
| 4 | Editing polish (themes / outline / find / stats / settings) | ✅ |
| 5 | AI streaming output (`@shikijs/stream`, the main line) | ⏳ planned |

See [PLAN.md](./PLAN.md) for details.

## 📄 License

[MIT](./LICENSE)
