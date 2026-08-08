# md-ai

Typora 式 WYSIWYG Markdown 编辑器 · Shiki 代码高亮 · Electron + Vue 3。

详见 [PLAN.md](./PLAN.md)。

## 开发

```bash
npm install
npm run dev        # 启动 electron-vite 开发（HMR）
npm run typecheck  # 类型检查
npm run build      # 构建到 out/
npm run build:mac  # 打包 macOS dmg
```

## 目录

- `electron/` — 主进程（main / preload / 文件服务）
- `src/` — 渲染进程（Vue 3）
- `index.html` — 渲染入口

## 阶段进度

- [x] Phase 0 · 脚手架
- [x] Phase 1 · Milkdown 编辑器内核
- [x] Phase 2 · Shiki 代码块高亮
- [ ] Phase 3 · 文件 I/O 与外壳
- [ ] Phase 4 · Typora 体验打磨
- [ ] Phase 5 · AI 流式输出（@shikijs/stream）
