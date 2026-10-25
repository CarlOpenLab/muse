# RFC-001：编辑器内核选型——原生外壳 + Web Canvas，还是继续全原生

- **状态**：已实施 M1（2026-10-25）——目标方案落地：MyGo 原生 `ui.WebView` 元素承载 Vue 3 + Milkdown 画布（`native/nativeui/webeditor.go` + `editor-web/src/app/`），桥协议经 mygo IPC（`Muse.*` 绑定方法 + `muse:bridge` 事件）运行，WebKitGTK 缺失或 `MUSE_NATIVE_EDITOR=1` 时自动回退全原生编辑器。早期 Proposed/M0/M0.5 PoC 的结论与过程见下文与 [rfc-001-m0-poc-report.md](rfc-001-m0-poc-report.md)。
- **日期**：2026-10-23
- **相关**：[native-migration.md](native-migration.md)、[WYSIWYG-PLAN.md](../WYSIWYG-PLAN.md)
- **影响范围**：正文编辑器内核、构建/发布链路、测试体系、AI 选区桥
- **决策请求**：批准 M0 PoC；在 PoC 结论出来前不删除现有原生编辑器

---

## 摘要

Muse 目前已经有一套可运行的原生 WYSIWYG 编辑器，覆盖段落、标题、列表、引用、表格单元格、代码块、公式块、图片块和行内公式。但这条路线实际上是在 MyGo 上自研一个富文本编辑器内核，而不是“接一个 Markdown 编辑器”：文本布局、光标、选区、IME、撤销、表格、公式、图片和链接都要自己补。

Go / MyGo 生态没有生产级的 Markdown WYSIWYG 框架。成熟方案几乎都在 Web 技术栈：Milkdown、Vditor、Muya、Toast UI、TipTap、Lexical。

本 RFC 建议：

1. **目标方案**：保留 Go/MyGo 原生外壳，正文画布改为 **WKWebView + Milkdown 7**；Go 继续负责文件、工作区、AI、设置、菜单和保存。
2. **先做 PoC**：用 1–2 天验证 Vditor 或 Milkdown 在 WKWebView 中的加载、编辑、保存、IME 和主题；PoC 通过后再投入正式迁移。
3. **保留回退**：在功能对齐前保留当前原生编辑器，通过 feature flag 切换；不直接删除 `native/nativeui/wysiwyg.go` 一系代码。

如果“完全不用 WebView”仍是不可放松的产品约束，则本 RFC 的目标方案不成立，应改为 Qt `QTextDocument` 或 macOS TextKit 2 的纯原生路线；两者成本都显著更高。

---

## 1. 背景

### 1.1 已经发生了什么

- 仓库曾有一套 Vue 3 + Milkdown 7 的前端编辑器，位于 `app/`；`git show HEAD:app/package.json` 可见 `@milkdown/core@7.22`、`preset-commonmark`、`preset-gfm`、`plugin-block`、`plugin-history`、`katex`、`shiki` 等依赖。
- 为满足“完全原生、去 WebView”的目标，`app/` 在工作区被删除，改为 `native/` 下的 MyGo 原生实现。
- 原生实现已经完成：
  - `native/nativeui/wysiwyg.go`：段落/标题/列表/引用的富文本编辑、标记隐藏、光标/选区、IME 组合预览、撤销、粘贴；
  - `native/nativeui/image_edit.go`：图片块的 alt/src/title 字段编辑；
  - `native/nativeui/code_edit.go`：代码块/公式块的围栏剥离与恢复；
  - `native/mdoc/inline_runs.go`：Markdown 行内标记到可见文本/样式的映射；
  - `native/mdoc`：块级 Markdown 解析、渲染、公式/图表等。
- 现有测试：`go test ./...`、`go vet ./...` 通过；`ui.NewTester` 覆盖了大部分原生交互。

### 1.2 原生路线暴露的真实成本

当前原生编辑器已经能工作，但仍有明显缺口：

- 行内公式是 Unicode 原子，不是真正的行内排版图片；
- 表格行列增删/移动、图片拖拽缩放没有做；
- 富文本链接 URL 弹层没有做；
- 长段落极端光标定位、IME 候选词边界还需要继续打磨；
- HTML 块现在只渲染，不再提供编辑；
- 代码块/公式块仍以文本区编辑“内容本身”（不是 Markdown 标记，但这仍是编辑器内核的一部分）。

这些不是“再补几个按钮”就能结束的工作。它们共同依赖文本布局、段落/原子混排、输入法、撤销栈、表格模型和序列化，属于编辑器内核问题。

### 1.3 关键约束冲突

之前的产品约束是：

> 完全 MyGo 原生，不使用 WebView。

这个约束与“快速获得 Typora 级 WYSIWYG”直接冲突：

- MyGo 没有 Markdown 支持；
- `ui.RichText` 只有行内样式，没有块级光标/编辑；
- 没有现成的原生 Markdown WYSIWYG 组件；
- 公式、Mermaid、代码高亮、图片粘贴都没有等价物。

结论：**全原生不是不能做，而是必须按“自研编辑器框架”立项，不能按“接一个 Markdown 编辑器”估算。**

---

## 2. 问题定义

需要决定的是：

> Muse 的正文编辑器，是继续自研 MyGo 富文本内核，还是把正文画布交给成熟的 Web Markdown 编辑器，保留原生外壳？

关键不是“有没有 Markdown 渲染器”，而是：

- 是否要 Markdown 作为源格式；
- 是否要真正的 WYSIWYG（而不是源码 + 预览）；
- 是否要表格、公式、代码、图片、IME、撤销、链接等完整编辑能力；
- 是否接受 WebView 只用于正文画布；
- 团队更愿意维护 Go 编辑器内核，还是维护 Web 编辑器集成层。

---

## 3. 可选方案

### 方案 A：继续全原生 MyGo

**做法**：在现有 `native/nativeui/wysiwyg.go` 上继续补行内公式图片、表格操作、图片缩放、链接弹层、长文本光标、IME 边界。

**优点**

- 保持“完全原生”的产品定位；
- 无 WebView 运行时、无 JS 依赖、无 JS 安全面；
- 启动和内存可控；
- 与现有 MyGo 外壳、AI、文件树天然一致。

**缺点**

- 没有现成框架，仍是在写编辑器内核；
- 需要自研行内原子布局、表格模型、图片布局、链接 UI、撤销/输入法边界；
- 估算仍需数月才能接近 Typora；且不保证达到；
- 维护成本长期存在。

**结论**：不作为首选，除非“无 WebView”是不可谈判的硬约束。

### 方案 B：原生外壳 + WKWebView + Milkdown 7（推荐目标）

**做法**

- Go/MyGo 保留窗口、文件树、标签、设置、AI、菜单、自动保存；
- 正文区域一个 WKWebView（Windows 用 WebView2，Linux 用 WebKitGTK）；
- Web 侧使用 Milkdown 7（ProseMirror）：
  - `preset-commonmark` / `preset-gfm`；
  - 表格、任务列表、代码块、图片；
  - KaTeX 数学；
  - Shiki 代码高亮；
  - history / cursor / listener / tooltip；
  - 主题用 CSS 变量；
- 通过 JSON 消息桥交换 Markdown、选区、命令和主题。

**优点**

- Markdown 原生（ProseMirror schema + Markdown serializer）；
- 光标、选区、IME、撤销、复制粘贴、表格、代码、公式、图片、链接都是成熟能力；
- 与之前 `app/` 的技术栈一致，可从 `HEAD` 选择性恢复编辑器代码，降低探索成本；
- 插件化扩展（AI 选区、自定义块、搜索、slash menu）比在 MyGo 里自研容易；
- 原生外壳和 AI 仍由 Go 控制。

**缺点**

- 引入 WebView，违背之前的“完全原生”约束；
- 多一层 JS 构建、资源打包、桥接和调试；
- 内存/启动成本高于纯原生；
- WebView 三平台宿主需要分别处理；
- Markdown 序列化会规范化格式，不能保证逐字节原样。

**结论**：如果“正文画布可以用 WebView”，这是性价比最高的路线。

### 方案 C：原生外壳 + WKWebView + Vditor（最快 PoC）

**做法**：用 Vditor 的 `wysiwyg` 或 `ir` 模式，直接替换正文画布。

**优点**

- 开箱即用，中文文档完善；
- 表格、代码、KaTeX、Mermaid、图片上传内置；
- `getValue()` 直接返回 Markdown；
- 1–3 天可做出可点击 PoC。

**缺点**

- UI/交互比较“成品化”，深度定制不如 ProseMirror；
- 复杂 AI 选区、块级扩展、diff 交互不如 Milkdown 灵活；
- 仍需 WebView 和桥接。

**结论**：适合做 M0 验证；如果产品接受其交互，也可以直接作为长期方案。

### 方案 D：Qt `QTextDocument` 原生富文本

**做法**：用 Qt 的 `QTextDocument` / `QTextEdit`，利用其 Markdown import/export、富文本、表格、图片、IME、撤销和选区能力。

**优点**

- 真正原生，无 WebView；
- 文本编辑基础设施成熟（IME、撤销、选区、表格、图片）；
- 跨平台。

**缺点**

- 需要把 MyGo UI 层迁移到 Qt，或嵌入 Qt 窗口；
- Markdown 支持是“导入/导出”，不是完整 WYSIWYG schema；
- 公式、Mermaid、代码高亮、复杂自定义块仍要自己做；
- Go 绑定（MIQT / therecipe/qt）增加构建复杂度；
- 工作量以月计。

**结论**：如果坚持无 WebView 且接受换 UI 技术栈，这是最现实的原生替代。

### 方案 E：macOS TextKit 2 / NSTextView

**做法**：Swift/AppKit 的 TextKit 2 + `NSTextView`，Markdown 解析 + attributed string + `NSTextAttachment` 公式图片。

**优点**

- macOS 原生体验最好；
- IME、撤销、选区、表格、图片附件成熟；
- 完全无 WebView。

**缺点**

- macOS-only；
- 等于重写编辑器和大量 UI；
- Markdown 解析/序列化、公式、Mermaid 仍要自研；
- 以月计，且与现有 Go 外壳跨语言。

**结论**：只在“macOS-only + 无 WebView + 愿意重写”时考虑。

### 方案 F：Flutter / AppFlowy Editor / Super Editor

**做法**：迁移到 Flutter，用块编辑器框架。

**优点**

- 原生渲染、跨平台；
- 富文本、表格、图片、IME 基础设施较好。

**缺点**

- 需要重写整个 UI；
- 多数不是 Markdown 原生，需要自己做 Markdown 序列化/兼容；
- 与现有 Go/MyGo/AI 代码融合成本高；
- 引入新运行时和构建链。

**结论**：不推荐仅为编辑器迁移整站技术栈。

### 方案对比

| 方案 | Markdown 原生 | 真 WYSIWYG | 无 WebView | IME/撤销/表格 | 迁移成本 | 主要风险 |
|---|---|---|---|---|---|---|
| A 继续 MyGo | 是 | 部分 | 是 | 自研 | 数月 | 长期补内核 |
| B Milkdown | 是 | 是 | 否 | 成熟 | 2–4 周 | WebView/桥接 |
| C Vditor | 是 | 是 | 否 | 成熟 | 1–2 周 | 定制性 |
| D Qt | 部分 | 部分 | 是 | 成熟 | 1–2 月 | 换 UI/公式 |
| E TextKit 2 | 否 | 是 | 是 | 成熟 | 2–3 月 | macOS-only |
| F Flutter | 否 | 是 | 是 | 较好 | 1–2 月+ | 重写 |

> 工作量为粗略工程估算，不是承诺；以 M0 PoC 结果修正。

---

## 4. 推荐决策

### 4.1 目标

**采用方案 B：原生外壳 + WKWebView + Milkdown 7。**

### 4.2 先 PoC，不直接迁移

1. **M0（1–2 天）**：在分支中做 Vditor + WKWebView PoC，验证：
   - 本地 HTML/JS 资源加载；
   - Markdown 载入/导出；
   - 中文 IME；
   - 主题切换；
   - 保存回 Go。
2. **M0.5（1–2 天）**：同条件做 Milkdown PoC，比较：
   - 表格/公式/代码/图片；
   - 自定义工具栏/主题；
   - 选区桥；
   - 包体积和启动。
3. **决策点**：如果 Vditor 满足产品交互，选 C 以减少集成；否则选 B 做长期。

### 4.3 边界

- WebView **只负责正文画布**，不承载文件树、设置、AI 面板、菜单；
- Go 仍是文件、工作区、AI、保存、窗口的所有者；
- Web 侧不直接访问文件系统；
- 发布包只加载本地资源，不加载远程脚本；
- 现有原生编辑器保留为 fallback，至少保留一个发布周期。

---

## 5. 目标架构

```
┌────────────────────────────────────────────────────┐
│ MyGo 原生外壳（Go）                                 │
│  Window / FileTree / Tabs / Settings / AI / Menu   │
│  Document store（source of truth）                  │
│  Save / autosave / external change                 │
└───────────────▲───────────────────────┬────────────┘
                │ JSON bridge           │ evaluateJavaScript
                │                       │
┌───────────────┴───────────────────────▼────────────┐
│ WKWebView（仅正文画布）                             │
│  Milkdown 7 / ProseMirror                          │
│  CommonMark + GFM + tables + tasks + code + math    │
│  KaTeX / Shiki / image / link / history / IME       │
└────────────────────────────────────────────────────┘
```

### 5.1 平台宿主

- **macOS**：`WKWebView` + `WKScriptMessageHandler`；优先支持。
- **Windows**：WebView2；`WebMessageReceived`。
- **Linux**：WebKitGTK；`script-message-received`。
- 如果 Muse 是 macOS-only，先只做 macOS，避免三平台同时开工。

### 5.2 Bridge 协议

Native → Web：

```json
{ "type": "document.set", "path": "...", "markdown": "...", "revision": 12, "theme": "light" }
{ "type": "theme.set", "theme": "dark", "tokens": { "text": "#..." } }
{ "type": "command", "name": "focus|undo|redo|selectAll|insertMarkdown|replaceSelection", "args": {} }
{ "type": "selection.get", "id": 7 }
```

Web → Native：

```json
{ "type": "ready" }
{ "type": "document.changed", "markdown": "...", "revision": 13 }
{ "type": "document.saveRequested", "markdown": "..." }
{ "type": "selection.changed", "from": 10, "to": 20, "text": "..." }
{ "type": "link.open", "href": "https://..." }
{ "type": "image.paste", "mime": "image/png", "base64": "..." }
```

约束：

- 每个请求带 `id`，响应带同一个 `id`；
- 用 `revision` 防止 native/web 回写循环；
- `document.changed` 防抖 150–250ms；
- 保存时 native 主动 `selection.get` / `document.get`，不依赖最后一次变更事件；
- 桥接错误要显示原生错误条，不静默吞。

### 5.3 数据流

- **打开**：native 读文件 → `document.set` → web 渲染。
- **编辑**：web 内部编辑；变更事件只更新内存 Markdown，不立即写盘。
- **保存**：native 请求当前 Markdown（或使用最后一次变更），写临时文件 + rename；成功后更新 revision。
- **外部变更**：native 检测文件 mtime/内容变化；若 web 有未保存修改，弹原生确认；否则 `document.set` 重新载入。
- **关闭**：native 先 `document.get`，走现有 dirty/save 确认。
- **AI**：native 取选区/全文 → 请求模型 → 结果通过 `replaceSelection` 或 `insertMarkdown` 回写；diff 预览可沿用现有原生提议机制，或在 web 侧渲染。

### 5.4 功能映射

| 功能 | 归属 |
|---|---|
| Markdown 解析/序列化 | Milkdown（ProseMirror schema） |
| 光标/选区/IME/撤销 | ProseMirror + WebView |
| 表格/任务列表 | GFM preset |
| 代码块/高亮 | Milkdown code block + Shiki |
| 公式 | KaTeX plugin |
| 图片粘贴/拖放 | web 侧自定义插件 → native 存文件 |
| 链接弹层 | Milkdown tooltip / custom |
| 文件树/标签/设置 | native |
| AI 请求/模型配置 | native |
| 大纲/搜索 | 可先 native（解析 Markdown）或 web 插件 |
| 主题 | native 传 token，web CSS 变量 |
| 保存/关闭/自动保存 | native |

### 5.5 安全

- `WKWebView` 只加载 `file://` 本地 bundle 或自定义 `muse://` scheme；
- `CSP: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;`；
- 禁止导航到外部 URL；外链交给系统浏览器；
- 发布版关闭 Web Inspector；
- 不把 API key、文件系统路径暴露给 JS；
- 图片/文件写入由 native 完成，web 只传字节/相对路径；
- 依赖锁定版本，CI 做 license 检查。

### 5.6 构建与发布

- `app/` 恢复为独立 Vite 工程，产出静态 `dist`；
- Go 用 `go:embed` 嵌入 `dist`（或构建时复制到 Resources）；
- CI 增加 `pnpm install --frozen-lockfile && pnpm build`；
- 发布前跑 JS 单测 + Go 测试 + 端到端冒烟；
- macOS 签名/公证覆盖 WebView 内容不影响签名，但资源路径要检查；
- 设置 feature flag：`MUSE_EDITOR=web|native`，默认先 `native`，验收后切 `web`。

---

## 6. 迁移计划

### M0：PoC（1–2 天）

- 新建 spike 分支；
- 恢复一个最小 Vite + Vditor 页面；
- macOS WKWebView 宿主加载本地页面；
- 打开一个 fixture Markdown，编辑，保存回 Go；
- 验证中文 IME、主题、表格、公式、代码、图片。

**退出条件**：能连续编辑/保存 10 次不丢内容；IME 可用；决定 Vditor 或 Milkdown。

### M1：Milkdown 画布（约 1 周）

- 恢复/重建 `app/` 最小编辑器；
- `document.set` / `document.changed` / `saveRequested` 桥；
- 主题 token；
- feature flag；
- 现有文件树、AI、设置不变。

**退出条件**：打开/编辑/保存/关闭主链路通过；Markdown fixture 语义 round-trip。

### M2：功能对齐（约 1–2 周）

- 表格、任务列表、代码高亮、KaTeX、图片粘贴/拖放、链接弹层；
- 搜索、大纲、字数、快捷键、菜单命令；
- 选区桥；
- IME/撤销/复制粘贴回归。

**退出条件**：与当前原生编辑器功能对齐；无 P0 数据丢失。

### M3：AI 与发布（约 1 周）

- AI 选区/插入桥；
- diff/提议交互；
- 自动保存、外部变更、崩溃恢复；
- 打包、签名、体积/内存测试；
- 默认切换 + 保留 native fallback。

### M4：清理（下一个版本）

- 观察一个发布周期；
- 无回退需求后，删除 `native/nativeui/wysiwyg.go` 等自研编辑内核；
- 文档更新，移除“完全原生”表述（如果产品定位也调整）。

---

## 7. 验收标准

### 功能

- 打开/编辑/保存/另存为/关闭确认；
- GFM：标题、段落、粗体/斜体/删除线、链接、列表、任务列表、引用、表格、代码块、分隔线；
- 数学：行内/块级 KaTeX；
- 图片：本地/远程、粘贴、拖放、alt/title；
- 代码高亮；
- 中文/日文 IME；
- 撤销/重做、复制/剪切/粘贴、全选；
- 查找/替换（若保留）；
- 主题切换。

### 数据

- 20 个 fixture 的 Markdown → 编辑器 → Markdown 语义 round-trip；
- 代码围栏语言、表格对齐、任务状态、公式、图片路径不丢失；
- 允许规范化（空行/转义/表格空格），但必须在 RFC 附录记录；
- 保存失败不破坏原文件（临时文件 + rename）。

### 性能/稳定性

- 10k 字文档输入无可感卡顿；
- 冷启动不超过当前原生版本的 1.5 倍（目标值，PoC 实测后修正）；
- 连续编辑 30 分钟不崩溃、不泄漏；
- 外部修改/恢复/网络断开不丢内容。

### 安全

- 无远程脚本；
- 外链走系统浏览器；
- WebView 不能读任意文件（除授权资源）；
- release 关闭 devtools；
- 依赖 license 清单通过。

### 测试

- Go：`go test ./...` / `go vet ./...` 保持绿；
- Web：Vitest/Playwright 覆盖编辑、保存、桥接；
- 端到端：打开 fixture → 编辑 → 保存 → 重新打开；
- 原生外壳仍用 `ui.NewTester`。

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 违背“完全原生”定位 | 产品/品牌 | 先做决策；RFC 明确 WebView 仅画布；feature flag 可回退 |
| Markdown 规范化 | 用户 diff 变大 | fixture round-trip；记录规范化规则；必要时保留源码模式 |
| 桥接竞态/回写循环 | 内容覆盖 | revision + 请求 id + 防抖 + 保存前主动拉取 |
| WebView 内存/启动 | 体验下降 | 只加载一个画布；延迟初始化；实测对比 |
| 三平台宿主差异 | 发布复杂 | macOS 优先；Windows/Linux 后置 |
| 依赖维护/许可 | 供应链 | 锁定版本；license 检查；Milkdown/ProseMirror MIT |
| 两套编辑器并行 | 维护成本 | 明确 M4 删除时间；feature flag 仅一个周期 |
| AI 选区/回写 | 功能回归 | 桥接 API 先于 UI；保留 native AI 逻辑 |
| 无障碍/快捷键 | 体验 | Web 侧键盘测试；原生菜单转发 |

---

## 9. 未决问题

1. **WebView 是否可接受？** 只用于正文画布，外壳仍原生，是否满足产品“原生”定义？
2. **Muse 是否 macOS-only？** 若是，WKWebView 成本最低；若跨平台，需 WebView2/WebKitGTK。
3. **Markdown 必须逐字节保持，还是语义保持即可？** WYSIWYG 通常会规范化格式；这决定验收标准。
4. **AI diff 放 native 还是 web？** 现有 native AI 提议机制是否复用？
5. **Vditor 是否足够？** 如果交互可接受，直接用 Vditor 可再省 1–2 周；否则 Milkdown。
6. **原生编辑器保留多久？** 建议至少一个发布周期，之后删除。
7. **是否接受新增 JS 构建链和 CI 时间？**

---

## 10. 参考

- 既有前端（`HEAD` 中仍可恢复）：`app/package.json`、`app/src/editor/MilkdownCore.vue`、`app/src/editor/MilkdownEditor.vue`、`app/src/editor/math/mathPlugin.ts`、`app/src/editor/shiki/`。
- [Milkdown](https://milkdown.dev/)
- [Vditor](https://github.com/Vanessa219/vditor)
- [Muya / Mark Text](https://github.com/marktext/muya)
- [ProseMirror](https://prosemirror.net/)
- [TipTap](https://tiptap.dev/)
- [Lexical](https://lexical.dev/)
- [Toast UI Editor](https://ui.toast.com/tui-editor)
- [Qt QTextDocument](https://doc.qt.io/qt-6/qtextdocument.html)
- [Apple TextKit 2](https://developer.apple.com/documentation/appkit/textkit)
- [AppFlowy Editor](https://github.com/AppFlowy-IO/appflowy-editor)
- 当前原生实现：[wysiwyg.go](../native/nativeui/wysiwyg.go)、[image_edit.go](../native/nativeui/image_edit.go)、[code_edit.go](../native/nativeui/code_edit.go)、[inline_runs.go](../native/mdoc/inline_runs.go)

---

## 决策记录

| 日期 | 决策 | 备注 |
|---|---|---|
| 2026-10-23 | 提出 RFC，等待评审 | 不实施；先做 M0 PoC |
| 2026-10-23 | M0/M0.5 Web 侧 PoC 完成：双画布 16/16 fixture 语义往返、桥协议 8/8 单测 + 页内宿主模拟端到端（保存握手/id 回显/revision/防抖/主题/图片回插）、连续 10 轮编辑保存无丢失；IME 与加载性能需 macOS 宿主真机验证 | 见 [rfc-001-m0-poc-report.md](rfc-001-m0-poc-report.md)、`editor-web/`；建议宿主验证后选方案 B（Milkdown），Vditor 数据保留备选 |
