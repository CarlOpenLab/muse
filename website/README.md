# Muse — 官网

> 所写，即所见。为 [Muse](https://github.com/CarlOpenLab/muse) 而作的产品官网。

一个零依赖、零构建的静态单页：纯手写 HTML / CSS / 原生 ES Module。所有素材本地自托管，离线可用。

## 本地预览

```bash
# 仓库根目录
python3 -m http.server -d website 8765
# 打开 http://127.0.0.1:8765
```

（任何静态服务器都可以；不要用 `file://` 打开，模块脚本与字体需要 http。）

## 结构

```
website/
├── index.html              单页结构：Hero（应用窗口） / 缪斯 Agent / 原生 / 图与公式 / 工作区 / 内核 / 下载
└── assets/
    ├── css/main.css        设计令牌逐字取自 native/nativeui/app.go 的 applyTheme() + 窗口 chrome + 双主题
    ├── js/main.js          主题切换 · 滚动显现 · hero 原地编辑打字演示 · Agent 审批流状态机
    ├── fonts/              Space Grotesk / Instrument Serif / JetBrains Mono（可变字体）
    │                       + Noto Serif SC 22 字子集（标题衬线强调字，6KB）
    └── img/                favicon 与 og 图（由 ../resources/icon.png 生成）
```

## 设计说明

- **「官网即应用」**：色板逐字取自产品源码（`applyTheme()`）——暗色窗口 `#1a1a1a` / 面板 `#232328` /
  表面 `#2a2a30`；官网强调色为单色（Linear 风）：暗色近白 `#f5f5f7`、亮色近黑 `#17171a`——黑白灰层次，不用彩色强调。导航栏的主题开关切换整站，与产品行为一致。
- **主视觉是产品本身**：所有演示都是 DOM 复刻的应用窗口——56px 图标栏、文件树、编辑卡片、Agent 面板，
  图标路径与 `native/nativeui/icons.go` 同源（Lucide）。
- **Agent 演示是真的**：进入视口自动播放一段真实交互脚本——用户提问、思考（可折叠）、读取文档、
  **工具审批卡暂停**。点「同意修改 / 总是允许 / 拒绝」走不同分支；把权限预设切到「完全访问」跳过审批，
  切到「只读」看 Agent 被拒后如何改道。
- **双主线**：原生优先（Go 外壳 + 内嵌 Milkdown 画布）× Agent（13 个工具、审批、权限）；键盘快捷键以芯片形式并入原生区。
- **装饰做减法**：没有极光 WebGL、没有自定义光标、没有预加载器；动效只有滚动显现与演示本身。
- **渐进增强**：`prefers-reduced-motion` 下关闭全部动效；无 JS 时内容完整可读；窄屏逐级收起面板。

## 无障碍与性能

- 全部图标/装饰 `aria-hidden`，交互元素有 `aria-label` / `role="switch"` / `role="radiogroup"`；
- `:focus-visible` 全局焦点环；Agent 演示容器 `aria-live="polite"`；
- 动画只用 `transform/opacity`；字体 `font-display: swap`；离线可用。
