# Muse 原生化（mygo 基座 + 插件）落地方案

目标：Muse 的界面全部由 mygo 原生渲染，去掉内嵌 Vue/Milkdown 的 webview；文件类型、AI 工具、渲染器、面板都以插件形式提供；AI 编辑改为「先出 diff，确认后应用」。

本文只记录结论与边界，进度以代码与测试为准。

## 1. 能力边界（已在 mygo v0.4.5 核实）

能直接用：

- 原生窗口：`mygo.NewWindow(WindowOptions{Content: ui.View(fn)})`，不加载 webview。
- 控件：`ui.Column/Row/Scroll/Text/RichText/Divider/TextInput/Button/Tabs/...`，`RichText` 支持行内 `Span`（粗体、斜体、删除线、下划线、颜色、背景、字体）。
- 源码编辑器：`ui/editor.go` 一整套（高亮、折叠、查找、多光标）。
- headless 测试：`ui.NewTester(view, w, h)`，可 `Texts()/HasText()/Find()/Click()/Type()`，**无需窗口**，原生化可以 TDD。

必须自研或替代：

- **块级 Markdown 渲染**：`ui` 没有任何 markdown 支持，需要自建块模型 + 渲染（本仓库 `native/mdoc` 已完成第一版）。
- **所见即所得编辑**：`ui.RichText` 只有行内样式、没有光标/块编辑；块级 WYSIWYG 要从零做。
- **diff 视图**：`ui` 没有 diff 组件，需要自算行/词级 diff 再用带底色的 `RichText` 画。
- 公式（KaTeX）、图表（mermaid）、粘贴图片：无等价物。

结论：界面外壳、文件树、标签、命令面板、设置、AI 面板 → 原生没问题；**富文本 WYSIWYG 是全量原生里最贵的一块**，需要单独立项、分批推进。

## 2. 插件契约

mygo 的 `mygo.Use(...)` 是编译期插件（Go service + npm 包），**不是热插拔**。Muse 自己的插件形态定为「编译期注册 + 运行期可发现」，四个贡献点：

1. **DocType**：扩展名 → 解析器 + 原生视图（`native/doc`）。已落地：`markdown`、`text`（纯文本，保留换行），其余非二进制扩展名兜底为纯文本。
2. **AI 工具**：给模型的工具由插件注册（读写选区、按标题定位、按行区间读等）。
3. **Renderer**：一种块类型的自定义画法（代码块、表格、图片、公式）。
4. **Panel**：侧栏/底部面板。

真热插拔（外部目录 + manifest + 进程外 RPC）留到插件契约稳定之后，先保证接口形状对不对。

## 3. AI 编辑重建（提议 diff → 确认）

现状的拉跨点是工程问题，不是模型问题：

- 没有 agent 系统提示词（无角色、无「先读后写」、无「结论落到文档」约束）。
- 工具只有 6 个且是「盲改」：无大纲、无按标题/行区间读，长文档必然改错；`replace_text` 靠精确字符串匹配，markdown 里差一个空格就失败。
- 改动直接落笔，无 diff 预览，退靠 ⌘Z。
- 健壮性：`JSON.parse` 在 try 之外、tool_calls 增量用 `+=`、轮次到顶无收尾。

重建方向：

1. 系统提示词：角色 + 编辑准则 + 工具选择规则 + 「无必要不改动」。
2. 工具集：`get_outline` / `read_section` / `read_lines` / `replace_section` / `replace_lines` / `insert_after`，全部按结构定位。
3. 提议 diff：工具产出**提议**（目标区间 + 新内容），Muse 本地算 diff、渲染确认条，用户逐条或整体应用；短改写可直接落笔，结构性改动一律走 diff。
4. 把 agent 循环从 `app/src/chat/*` 移到 Go（`native/services`），前端删除后 AI 才真正不依赖 webview。

## 4. 迁移批次

- **B0（已完成）**：`native/mdoc` 文档模型 + 原生渲染 + 纯文本；`native/doc` DocType 注册表。统一 `go test ./...` 通过。
- **B1**：原生应用外壳——窗口、文件树、标签、命令面板、设置，不加载 webview；DocType 驱动打开/保存。
- **B2**：块级编辑（光标、插入/删除、撤销）；富文本从只读走到可编辑。
- **B3**：AI 原生化——agent 循环迁入 Go，新工具集 + 提议 diff 渲染。
- **B4**：删除 `app/`（Vue/Milkdown）与 webview 装载代码；补图片、公式、表格编辑等渲染器。

## 5. 验收

每批以 `go test ./...` 与 `ui.NewTester` 的无窗口断言为准；原生化过程中随时可 `go build` 出可运行窗口人工核对，但不作为唯一手段。