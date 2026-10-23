# Muse

A fully native desktop Markdown editor built with **Go** and [MyGo](https://mygo.egoist.dev/). MyGo draws the window, icon rail, context panel and editor directly: **no WebView, no Electron, no frontend build**.

## What it does

- **Typora-style inline editing** — click a paragraph or heading and edit it as rendered rich text (no `#`, `**`, link or code markers), with the caret and selection in the visible text; list items and quote lines also edit as rich content with bullets/numbers/quote bars as chrome; code blocks edit without fences (language badge), table cells edit in place without pipes and rows/columns add/remove through the table's context menu (anchored to the edited cell); a list item with nested children edits as multi-line source (Tab/Shift+Tab round-trip byte-exactly), math hides `$$` with a live typeset preview, inline math shows a Unicode atom while preserving TeX, and IME composition is previewed at the caret, and images edit through alt/src/title fields.
- **Native Markdown rendering** — type scale, tables, task lists, local/remote/HTML images, quotes, code and syntax highlighting, HTML headings, and block math and matrices typeset with go-latex.
- **Keyboard behavior** — arrows/Home/End/PageUp/PageDown and Shift/Cmd/Option selection work through the native text area, arrows cross blocks at boundaries, Shift+Down/Up extends a selection into the next/previous block, Cmd+B/I/U/E wrap Markdown emphasis/code, Cmd+K inserts a link, opens the URL popover when the caret is on a link, or turns a selection into a link; Cmd+0–6 switch paragraph/heading levels; Tab/Shift+Tab indent/outdent list lines (and move between table cells, Cmd+Enter inserts a row below), brackets/quotes/backticks auto-pair, Enter creates the next block, Shift+Enter inserts a hard break, Esc/⌘↵ finish an edit.
- **Files** — open files/folders, tree, outline jump, search jump, relative/absolute path copy, rename, trash, Finder reveal; only editable text files (md/txt/json/yaml/source) appear, while images/PDFs/archives are hidden and rejected; system dialogs run off the UI thread.
- **AI** — native OpenAI-compatible chat with streaming Markdown answers, local persistence, model discovery, insert-to-document, and a local model settings page (Base URL, API Key, model, system prompt). Settings are stored at `~/Library/Application Support/Muse/ai.json`; chat at `chat.json`, both mode 0600.
- **Themes** — flat pure white/grey light theme and a near-black dark theme.
- **Mermaid** — native flowchart subset (`graph`/`flowchart` TD/LR, labelled nodes and edges, dashed links) sequence diagrams (participants, solid/dashed messages, self messages, notes) state diagrams (start/end, labelled transitions), pie charts, class diagrams (members and relations) and Gantt charts (sections, dependencies, durations and milestones).

## Run

```bash
# from the repository root
go run -C native .
```

Build a binary:

```bash
go build -C native -o Muse .
```

Tests:

```bash
go test -C native ./...
```

Requires Go 1.27+ (see `native/go.mod`). No Node, pnpm, vite or WebView is needed.

## Project layout

```
native/
├── main.go            native entry point
├── nativeui/          window, icon rail, context panel, inline editor, AI, Mermaid
├── mdoc/              Markdown model, renderer, syntax highlighting, math images
├── doc/               document type registry
├── services/          native AI HTTP client and legacy service code
└── cmd/               auxiliary commands
```

## Known limits

- Inline math is typeset in paragraphs, headings, list items, quotes and table cells. Display matrices, cases, aligned/align/array and ^/_ scripts are supported; rarer TeX commands may still fall back.
- Mermaid support covers flowcharts, sequence diagrams, state diagrams, pie charts, a class-diagram subset and a Gantt subset; loop/alt frames are expanded to message order, and advanced Mermaid features may render as code.
- AI chat is capped at the last 100 messages; tool calls and multi-conversation history are not wired yet.
- The updater/export/recent-file panels from the old WebView shell are not part of the native build yet.
