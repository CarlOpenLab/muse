<p align="center">
  <img src="resources/icon.png" alt="Muse" width="128" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Muse-WYSIWYG%20Markdown%20Editor-88c0d0" alt="Muse" />
</p>

<h1 align="center">Muse</h1>

<p align="center">
  <strong>A WYSIWYG Markdown editor for the desktop</strong> · real-time Shiki highlighting · Go (MyGo) + Vue 3
</p>

<p align="center">
  <a href="./README.zh-CN.md"><img src="https://img.shields.io/badge/README-中文-blue" alt="中文"></a>
  <img src="https://img.shields.io/badge/MyGo-Go%20%2B%20WebView-00ADD8" alt="MyGo">
  <img src="https://img.shields.io/badge/Vue-3.5-42B883" alt="Vue 3.5">
  <img src="https://img.shields.io/badge/Milkdown-7-2E3440" alt="Milkdown 7">
  <img src="https://img.shields.io/badge/Shiki-4-1F2328" alt="Shiki 4">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

<p align="center">
  <strong>🇬🇧 English</strong> · <a href="./README.zh-CN.md">🇨🇳 中文</a>
</p>

***

**Muse** is a **WYSIWYG Markdown editor** for the desktop. Type `#` and it becomes a heading; `**bold**` renders instantly; code blocks are highlighted in real time with **Shiki**. Built on **Milkdown 7** (ProseMirror), with AI streaming output planned as the project's true north.

## ✨ Features

* **WYSIWYG editing** — powered by Milkdown 7; headings, bold, lists, quotes, tables, and task lists render as you type
* **Typora-style interaction parity** — the goal of the first milestone:
  * **Shortcuts** — ⌘1-6 headings / ⌘0 paragraph / ⌘= ⌘- promote & demote heading / ⌘B ⌘I bold & italic / ⌘⇧\` inline code / ⌃⇧\` strikethrough / ⌘K link / ⌘\\ clear formatting / ⌘⌥Q quote / ⌘⌥U ⌘⌥O lists / ⌘⇧X task list / ⌘⌥C code fence / ⌘⌥B math block / ⌘⌥T table / ⌘] ⌘[ list indent (matches Typora macOS defaults)
  * **Native menus** — the Paragraph / Format / View menus mirror Typora
  * **Context menu** — right-click inside the editor: clipboard + inline formatting + paragraph + table row/column ops (table ops appear automatically inside tables)
  * **Folder / file-tree sidebar** — the Open Folder button in the status bar (or File > Open Folder… ⌘⇧O, or dropping a folder onto the window) opens a Typora-style file tree on the left: click to open, active-file highlight, right-click to create file/folder, rename, move to trash, reveal in Finder; external changes refresh automatically (⌘⇧L or the status-bar button toggles the sidebar)
  * **Table editing** — ⌘⌥T to insert; right-click to add/remove rows & columns or delete the table; Tab / ⇧Tab to jump cells
  * **Math** — `$…$` inline and `$$…$$` block (remark-math parsing + KaTeX rendering); click a formula to edit it, and type `$$` + Enter to convert a paragraph into a math block
  * **Image paste / drop** — pasted or dropped images are copied into an `assets/` folder next to the document and inserted with a relative path (Typora behavior); ⌘⌃I or right-click to pick a file
  * **Source code mode** — ⌘/ toggles between WYSIWYG and raw markdown, synced both ways
  * **Focus / typewriter mode** — F8 dims everything but the current paragraph; F9 keeps the caret at ~45% of the viewport height
  * **Export** — File > Export PDF (with body styling) / Export HTML (standalone styled file; relative image paths work)
  * **Smart paste** — pasting a plain URL over a selection turns it into a link
* **Shiki code highlighting** — instant coloring via ProseMirror *inline decorations*; the caret stays native and never jumps
  * 26 common languages loaded on demand (lazy chunks)
  * Editable language tag at the top-right corner of each code block
  * Theme-aware (`github-light` / `github-dark`)
* **Light / dark themes** — one-click toggle, CSS-variable driven, persisted locally
* **Auxiliary sidebar (Outline | AI)** — one slot, two panels: Outline (heading tree with smooth scroll-to navigation and current-section highlight) or AI chat (session switching, streaming answers, "reference current document" context, "insert into document", "replace selection"). The editor always stays in the main area; the sidebar can be dragged to resize and collapsed
* **AI tool calling (agent)** — describe a document problem in natural language and the AI edits the document directly through tools (read / replace selection / insert at caret / append to end / replace all); ⌘Z undoes it. Selecting text reveals a quick action bar: Polish / Expand / Summarize / Translate
* **Find & replace** — ⌘F to open, ⌘G / ⇧⌘G for prev/next, highlighted matches
* **Word count** — live stats in the status bar
* **Automatic updates (0.2.1+)** — signed daily update checks, in-app download/install and restart; Settings > App Updates controls automatic checks/downloads. Install 0.2.1 manually once when upgrading from 0.2.0.

* **Settings panel** — font size / line height, applied instantly and persisted
* **File management** — open / save / save as / new via native menus and shortcuts (⌘N / ⌘O / ⌘S / ⌘⇧S)
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
pnpm build         # = build:go: frontend bundle + native/Muse single binary (~18MB)
pnpm build:web     # frontend only → native/embed/dist
pnpm test:e2e      # e2e smoke (build + launch the app, runs assertions; needs a GUI)
pnpm test:agent    # agent-loop parsing unit tests (plain Node)
```

Debugging: under `pnpm dev`, View > Developer Tools (⌥⌘I) opens the Web Inspector
(frontend console / network). See [native/README.md](./native/README.md#调试) (Chinese).

### GitHub Actions Releases

Push a tag matching the version in `package.json` (for example, `v0.1.3`) to build and publish per-platform single binaries automatically:

```bash
git tag v0.1.3
git push origin v0.1.3
```

The workflow is `.github/workflows/release.yml`. On macOS / Windows / Linux runners it runs `pnpm build:web` + `go build`, then uploads the resulting executables to one GitHub Release:

| Asset        | Platform |
| ------------ | -------- |
| `Muse`       | macOS    |
| `Muse-linux` | Linux    |
| `Muse.exe`   | Windows  |

Repository Actions settings must allow workflows to write Releases (the workflow requests `contents: write`).

## 📁 Project Structure

```
muse/
├── app/                          # frontend (Vue 3 · workspace package @muse/app)
│   ├── App.vue                   # app shell (title bar / sidebar / canvas / status bar)
│   └── src/
│       ├── platform/mygoBridge.ts # window.muse bridge (IPC channel → Go service method)
│       ├── editor/               # editor kernel
│       │   ├── MilkdownCore.vue  # Milkdown wiring (commonmark + GFM + plugins)
│       │   ├── codeBlockView.ts  # code block node view (language input)
│       │   ├── searchPlugin.ts   # find & replace ProseMirror plugin
│       │   ├── block/            # block handles / block menu / block selection
│       │   ├── math/             # math (remark-math + KaTeX)
│       │   └── shiki/            # Shiki singleton + inline-decoration highlighting
│       ├── chat/                 # AI chat sidebar (sessions / streaming / agent tools)
│       ├── components/           # title bar / sidebar / file tree / outline / search / status bar / settings
│       ├── composables/          # file / theme / search / settings / stats / outline / workspace
│       └── styles/base.css       # theme variables + editor typography
├── native/                       # main process (Go + MyGo)
│   ├── main.go                   # window lifecycle / Typora-style menus / shortcuts
│   ├── services/                 # files / ai / export / appsvc / state
│   └── embed/dist                # pnpm build:web output (go:embed, gitignored)
├── resources/                    # app icons
└── package.json                  # root = orchestration only (dev / build / typecheck)
```

## 🗺️ Roadmap

| Phase   | Scope                                                       | Status    |
| ------- | ----------------------------------------------------------- | --------- |
| 0       | Vite + Vue 3 + TS scaffold                                  | ✅         |
| 1       | Milkdown editor core (WYSIWYG)                              | ✅         |
| 2       | Shiki real-time code highlighting                           | ✅         |
| 3       | File I/O & app shell (menus / drag-drop / recents)          | ✅         |
| 4       | Editing polish (themes / outline / find / stats / settings) | ✅         |
| 4.5     | **Typora interaction parity** (shortcuts / paragraph & format menus / context menu / table editing / math / image paste / source mode / focus & typewriter / PDF & HTML export) | ✅ |
| 4.6     | **Shell migrated to MyGo** (Go + system WebView replacing Electron; frontend and IPC channels reused) | ✅ |
| 5       | AI streaming output (`@shikijs/stream`, the main line)      | ⏳ planned |

Unit tests: `pnpm test:agent` (agent-loop parsing). e2e smoke: `pnpm test:e2e` (MyGo build + launch, runs DOM/IPC assertions; needs a GUI). The original Electron e2e scripts were removed with the shell migration and can be recovered from git history.

See [PLAN.md](./PLAN.md) for details.

## 📄 License

[MIT](./LICENSE)
