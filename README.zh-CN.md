<p align="center">
  <img src="resources/icon.png" alt="Muse" width="128" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Muse-WYSIWYG%20Markdown%20Editor-88c0d0" alt="Muse" />
</p>

<h1 align="center">Muse</h1>

<p align="center">
  <strong>所见即所得（WYSIWYG）Markdown 桌面编辑器</strong> · Shiki 实时高亮 · Go (MyGo) + Vue 3
</p>

<p align="center">
  <a href="./README.md"><img src="https://img.shields.io/badge/README-English-blue" alt="English"></a>
  <img src="https://img.shields.io/badge/MyGo-Go%20%2B%20WebView-00ADD8" alt="MyGo">
  <img src="https://img.shields.io/badge/Vue-3.5-42B883" alt="Vue 3.5">
  <img src="https://img.shields.io/badge/Milkdown-7-2E3440" alt="Milkdown 7">
  <img src="https://img.shields.io/badge/Shiki-4-1F2328" alt="Shiki 4">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

<p align="center">
  <a href="./README.md">🇬🇧 English</a> · <strong>🇨🇳 中文</strong>
</p>

***

一个**所见即所得（WYSIWYG）的 Markdown 桌面编辑器**：打字时 `#` 立刻变成标题、`**加粗**` 即时生效、代码块用 **Shiki** 实时语法高亮。基于 **Milkdown 7**（ProseMirror）构建，未来计划接入 **AI 流式输出**（Muse 的真正主线）。

* **自动更新（0.2.1 起）** — 每天后台检查、签名验证、应用内下载安装并重启；设置 → 应用更新可控制自动检查和自动下载。从 0.2.0 升级需手动安装一次 0.2.1。

## ✨ 功能特性

* **所见即所得** — Milkdown 7 内核，边打字边渲染 Markdown（标题 / 加粗 / 列表 / 引用 / 表格 / 任务列表等）
* **交互对齐** — 第一版对齐目标：
  * **快捷键** — ⌘1-6 标题 / ⌘0 正文 / ⌘= ⌘- 标题升降级 / ⌘B ⌘I 加粗斜体 / ⌘⇧\` 行内代码 / ⌃⇧\` 删除线 / ⌘K 链接 / ⌘\\ 清除格式 / ⌘⌥Q 引用 / ⌘⌥U ⌘⌥O 列表 / ⌘⇧X 任务列表 / ⌘⌥C 代码块 / ⌘⌥B 数学块 / ⌘⌥T 表格 / ⌘] ⌘[ 列表缩进（macOS 默认）
  * **原生菜单** — 「段落」「格式」「视图」菜单结构与主流 Markdown 编辑器对齐
  * **右键菜单** — 编辑器内右键：剪贴板 + 行内格式 + 段落 + 表格行列操作（表格内自动追加「插入/删除行列」）
  * **文件夹 / 文件树侧栏** — 底部工具条「打开文件夹」按钮（或文件 > 打开文件夹… ⌘⇧O、把文件夹拖进窗口），选中即展开左侧文件树：点击打开、当前文件高亮、右键新建文件/文件夹、重命名、移到废纸篓、Finder 显示；外部增删自动刷新（⌘⇧L 或底部工具条切换侧栏）
  * **表格编辑** — ⌘⌥T 插入表格；右键增删行列 / 删除表格；Tab / ⇧Tab 跳格
  * **数学公式** — `$…$` 行内、`$$…$$` 块级（remark-math 解析 + KaTeX 渲染），点击公式可编辑；输入 `$$` 回车即转公式块
  * **图片粘贴 / 拖拽** — 粘贴或拖入图片自动拷贝到文档同目录 `assets/` 并以相对路径插入；⌘⌃I / 右键选文件插入
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
  * 自动保存（防抖落盘）

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
pnpm build         # = build:go：前端产物 + native/Muse 单二进制（~18MB）
pnpm build:web     # 仅前端 → native/embed/dist
pnpm test:e2e      # e2e 冒烟（构建 + 启动应用跑断言，需图形界面）
pnpm test:agent    # agent loop 解析逻辑单测（纯 Node）
```

调试：`pnpm dev` 时「视图 > 开发者工具」（⌥⌘I）打开 Web Inspector（前端 Console / Network）；
详见 [native/README.md](./native/README.md#调试)。

### GitHub Actions 发布

推送与 `package.json` 版本一致的标签（例如 `v0.1.3`）即可自动构建各平台单二进制并发布：

```bash
git tag v0.1.3
git push origin v0.1.3
```

工作流位于 `.github/workflows/release.yml`。它在 macOS / Windows / Linux runner 上各自执行 `pnpm build:web` + `go build`，产出对应平台的可执行文件并上传到同一个 GitHub Release：

| 产物           | 平台      |
| ------------ | ------- |
| `Muse`       | macOS   |
| `Muse-linux` | Linux   |
| `Muse.exe`   | Windows |

仓库的 Actions 设置需要允许 workflow 写入 Releases（工作流已声明 `contents: write` 权限）。

## 📁 目录结构

```
muse/
├── app/                          # 前端（Vue 3 · workspace 包 @muse/app）
│   ├── App.vue                   # 应用骨架（标题栏 / 侧栏 / 画布 / 状态栏）
│   └── src/
│       ├── platform/mygoBridge.ts # window.muse 桥（IPC 通道 → Go 服务方法）
│       ├── editor/               # 编辑器内核
│       │   ├── MilkdownCore.vue  # Milkdown 装配（commonmark + GFM + 插件）
│       │   ├── codeBlockView.ts  # 代码块 node view（语言输入框）
│       │   ├── searchPlugin.ts   # 查找替换 ProseMirror 插件
│       │   ├── block/            # 块手柄 / 块菜单 / 块选区
│       │   ├── math/             # 数学公式（remark-math + KaTeX）
│       │   └── shiki/            # Shiki 单例 + inline decoration 高亮
│       ├── chat/                 # AI 对话侧栏（会话 / 流式 / agent 工具）
│       ├── components/           # 标题栏 / 侧栏 / 文件树 / 大纲 / 查找 / 状态栏 / 设置
│       ├── composables/          # 文件 / 主题 / 搜索 / 设置 / 统计 / 大纲 / 工作区
│       └── styles/base.css       # 主题变量 + 编辑器排版
├── native/                       # 主进程（Go + MyGo）
│   ├── main.go                   # 窗口生命周期 / 原生菜单 / 快捷键
│   ├── services/                 # files / ai / export / appsvc / state
│   └── embed/dist                # pnpm build:web 产物（go:embed 内嵌，gitignore）
├── resources/                    # 应用图标
└── package.json                  # 根＝纯编排脚本（dev / build / typecheck）
```

## 🗺️ 项目进度

| 阶段      | 内容                              | 状态    |
| ------- | ------------------------------- | ----- |
| Phase 0 | Vite + Vue 3 + TS 脚手架            | ✅     |
| Phase 1 | Milkdown 编辑器内核（WYSIWYG）         | ✅     |
| Phase 2 | Shiki 代码块实时高亮                   | ✅     |
| Phase 3 | 文件 I/O 与应用外壳（菜单 / 拖拽 / 最近文件）    | ✅     |
| Phase 4 | 编辑体验打磨（主题 / 大纲 / 查找 / 统计 / 设置）  | ✅     |
| Phase 4.5 | **交互对齐**（快捷键 / 段落与格式菜单 / 右键菜单 / 表格编辑 / 数学公式 / 图片粘贴 / 源代码模式 / 专注与打字机 / 导出 PDF·HTML） | ✅ |
| Phase 4.6 | **主壳迁移 MyGo**（Go + 系统 WebView 替换 Electron，前端与 IPC 通道复用） | ✅ |
| Phase 5 | AI 流式输出（`@shikijs/stream`，未来主线） | ⏳ 规划中 |

单测：`pnpm test:agent`（agent loop 解析逻辑）；e2e 冒烟：`pnpm test:e2e`（MyGo 版，构建后启动应用跑 DOM/IPC 断言，需图形界面）。原 Electron 版 e2e 脚本已随主壳迁移移除，可在 git 历史中找回。

详见 [PLAN.md](./PLAN.md)。

## 📄 License

[MIT](./LICENSE)
