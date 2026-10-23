# Muse — 官网

> 所写，即所见。Awwwards / FWA / Webby 级别的产品官网，为 [Muse](https://github.com/CarlOpenLab/muse) 而作。

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
├── index.html              单页结构：预加载 / Hero / 编辑演示 / AI / 图与公式 / 键盘 / 内核 / 主题 / 下载
└── assets/
    ├── css/main.css        设计系统（令牌取自 native/nativeui/app.go 的真实色板）+ 全部分区样式
    ├── js/main.js          预加载器 · CSS/WebGL 极光 · 自打字 WYSIWYG 演示 · AI 流式 · 键盘编排 · 主题
    ├── fonts/              Space Grotesk / Instrument Serif / JetBrains Mono（可变字体）
    │                       + Noto Serif SC 22 字子集（标题衬线强调字，6KB）
    └── img/                favicon 与 og 图（由 ../resources/icon.png 生成）
```

## 设计说明

- **品牌色板**直接取自产品源码：暗色画布 `#1a1a1a` / 文字 `#ececf0` / 强调 `#6b93ff`，亮色强调 `#3b6cf6`；
  极光渐变（粉 `#f2c4ec` → 薰衣草 `#b9a6f5` → 长春花蓝 `#7c8cf8`）来自 logo。
- **核心叙事**就是产品本身：01 区的窗口会自己打 Markdown 再把标记“溶解”成富文本；
  02 区 AI 流式回答逐块渲染；06 区的开关切换的是整个页面主题。
- **渐进增强**：WebGL 不可用时自动降级为多层动画 CSS 极光；`prefers-reduced-motion`
  下关闭全部动效；触屏设备隐藏自定义光标；无 JS 时内容完整可读。
- 演示中的功能描述均对应仓库真实能力（原地编辑、⌘ 快捷键、Mermaid 子集、go-latex、AI 对话与 0600 本地配置）。

## 无障碍与性能

- 全部图标/装饰 `aria-hidden`，交互元素有 `aria-label` / `aria-pressed` / `role="switch"`；
- `:focus-visible` 全局焦点环；
- 动画只用 `transform/opacity`；字体 `font-display: swap`；DPR 上限 1.25；离屏演示自动暂停。
