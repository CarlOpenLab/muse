# Muse

**所写，即所见。** 原生优先的桌面 Markdown 编辑器，内置会用工具的写作 Agent——Go 外壳 + 内嵌 WYSIWYG 画布，没有 Electron。

[![Release](https://img.shields.io/github/v/release/CarlOpenLab/muse?color=24292f)](https://github.com/CarlOpenLab/muse/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-24292f)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.27+-24292f)](native/go.mod)

[English](README.md) | 简体中文

官网：**https://carlopenlab.github.io/muse/**

基于 [MyGo](https://mygo.egoist.dev/) 构建，架构分两层：

- **原生外壳，由 Go 绘制在 GPU 上**（Metal / Direct3D 11 / OpenGL）——窗口、图标栏、文件树、大纲、搜索与整个 AI Agent 面板。
- **内嵌 WYSIWYG 画布**——Markdown 面是一个 Vue 3 + Milkdown（ProseMirror）页面，由 MyGo 自带的 WebView 元素承载，渲染与编辑同一份表示。它已构建进二进制（`go:embed`），因此仍是**一个 Go 二进制，没有 Electron，运行时不需要 Node**。WebView 不可用时，全原生块编辑器接管。

## 编辑器

- **Typora 式原地编辑** — 画布即渲染结果：点击段落、标题、列表项、引用或表格单元格，直接在富文本上编辑；`#`、`**`、链接、围栏、表格线等标记统统隐去。`Tab`/`Shift+Tab` 缩进列表与行走表格单元格；`⌘B/I/U/E` 包裹强调与代码，`⌘K` 编辑链接，`⌘0–6` 切换标题级别。
- **原生 Markdown 渲染** — 标题、表格、任务列表、引用、语法高亮代码、图片，块级/行内公式由 go-latex 排版。
- **Mermaid 原生支持** — 流程图、时序图、状态图、饼图、类图与甘特图子集，与正文同一引擎排版。
- **工作区面板** — 文件树、大纲跳转、全文搜索与 AI 助手共享一条侧栏，由图标栏切换；最近打开的文件在打开菜单里。

## 缪斯 Agent

AI 面板是一位真正的写作 Agent，不是聊天框：

- **13 个文档工具** — 列出、读取、搜索、大纲、目录树、统计、打开、精确替换编辑、插入、写入、重命名、回收站删除、新建文件夹。
- **工具审批卡** — 任何写操作之前，Agent 先出示要做的修改：同意这一次、本会话总是允许，或拒绝；拒绝原因会回到对话里。
- **权限三档** — *每次询问* / *完全访问* / *只读*，输入框旁一键切换。
- **能力分组开关** — 浏览、编辑、文件管理三组工具可在设置里按组开关；关闭的工具不会发给模型。
- **过程全透明** — 思考可折叠回看，每次工具调用带状态、参数与结果，正文流式渲染；你的话靠右，Agent 的每一步靠左。
- **OpenAI 兼容** — 任意端点（OpenAI、DeepSeek、本地网关）；不支持 function calling 的端点自动降级为纯对话。

隐私：Agent 的工具被限制在工作区根目录之内；API Key 与对话记录只存在本机配置文件（0600）。

## 安装

从 [Releases](https://github.com/CarlOpenLab/muse/releases/latest) 下载（Windows / macOS / Linux），或源码构建：

```bash
go run -C native .            # 运行
go build -C native -o Muse .  # 构建二进制
go test -C native ./...       # 测试
```

需要 Go 1.27+。不需要 Node、pnpm、vite——画布已预构建并内嵌；只有想改画布本身时才需要动 `editor-web/`。

## 项目结构

```
native/
├── main.go            原生入口
├── nativeui/          窗口、图标栏、上下文面板、Agent、原生回退编辑器
│   └── web/           内嵌画布构建产物（mygo://localhost 提供）
├── mdoc/              Markdown 模型、渲染器、语法高亮、公式图片
├── doc/               文档类型注册
├── services/          原生 AI HTTP 客户端
└── cmd/               辅助命令
editor-web/            Vue 3 + Milkdown 画布源码（预构建进 native/nativeui/web/dist）
```

## 已知限制

- 行内公式在段落、标题、列表项、引用与表格单元格中排版；较冷门的 TeX 命令可能回退为源码。
- Mermaid 覆盖流程图、时序图、状态图、饼图、类图与甘特图子集；高级特性可能渲染为代码。
- 对话记录最多保留最近 100 条。

## 许可

[MIT](LICENSE) © Carl Open Lab
