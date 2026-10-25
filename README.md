# Muse

**What you write is what you see.** A fully native desktop Markdown editor with a tool-using AI writing agent — every frame drawn by Go, zero WebView.

[![Release](https://img.shields.io/github/v/release/CarlOpenLab/muse?color=24292f)](https://github.com/CarlOpenLab/muse/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-24292f)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.27+-24292f)](native/go.mod)

English | [简体中文](README.zh-CN.md)

Website: **https://carlopenlab.github.io/muse/**

Built with [MyGo](https://mygo.egoist.dev/): the window, icon rail, context panel and editor are drawn directly on the GPU (Metal / Direct3D 11 / OpenGL). **No WebView, no Electron, no frontend build** — one Go binary.

## The editor

- **Typora-style in-place editing** — click a paragraph, heading, list item, quote or table cell and edit it as rendered rich text. Markers (`#`, `**`, links, fences, pipes) stay out of your way; `Tab`/`Shift+Tab` indents list lines and walks table cells; `⌘B/I/U/E` wraps emphasis and code, `⌘K` edits links, `⌘0–6` switches heading levels.
- **Native Markdown rendering** — headings, tables, task lists, quotes, code with syntax highlighting, images, and block/inline math typeset with go-latex.
- **Mermaid, natively** — flowcharts, sequence, state, pie, class and Gantt subsets, typeset by the same engine as your text.
- **Workspace panel** — file tree, outline jump, full-text search and the AI assistant share one sidebar, switched from the icon rail; recently opened files live in the open menu.

## The agent

The AI panel is a real writing agent, not a chat box:

- **13 document tools** — list, read, search, outline, workspace tree, stats, open, edit (exact-match replace), insert, write, rename, trash-delete, create folder.
- **Tool approval cards** — before any write, the agent shows what it is about to change. Approve once, always for this session, or deny; denials flow back into the conversation.
- **Permission presets** — *Ask every time* / *Full access* / *Read-only*, one click next to the composer.
- **Capability groups** — browse, edit and file-management tools can be switched on/off per group in settings; disabled tools are never sent to the model.
- **Transparent turns** — collapsible thinking, per-tool status rows with arguments and results, streamed Markdown answers; your words sit right, the agent's steps sit left.
- **OpenAI-compatible** — any endpoint (OpenAI, DeepSeek, local gateways); endpoints without function calling degrade gracefully to plain chat.

Privacy: agent tools are sandboxed to the workspace root; API keys and chat history stay in local config files (mode 0600).

## Install

Grab a build from [Releases](https://github.com/CarlOpenLab/muse/releases/latest) (Windows / macOS / Linux), or from source:

```bash
go run -C native .            # run
go build -C native -o Muse .  # build a binary
go test -C native ./...       # tests
```

Requires Go 1.27+. No Node, no pnpm, no vite.

## Project layout

```
native/
├── main.go            native entry point
├── nativeui/          window, icon rail, context panel, inline editor, agent, Mermaid
├── mdoc/              Markdown model, renderer, syntax highlighting, math images
├── doc/               document type registry
├── services/          native AI HTTP client
└── cmd/               auxiliary commands
```

## Known limits

- Inline math is typeset in paragraphs, headings, list items, quotes and table cells; rarer TeX commands may still fall back to source.
- Mermaid covers flowcharts, sequence, state, pie, a class-diagram subset and a Gantt subset; advanced features may render as code.
- Chat history is capped at the last 100 messages.

## License

[MIT](LICENSE) © Carl Open Lab
