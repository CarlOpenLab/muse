# Muse · MyGo 原生外壳

Muse 完全由 MyGo `ui` 绘制：窗口、56px 图标栏、上下文栏、AI 面板与设置在 `nativeui/`，所见即所得的 Markdown 编辑器在 `mdedit/`；不加载 WebView，也不需要前端构建。

## 运行

```bash
# 仓库根目录
go run -C native .

# 或
go build -C native -o Muse .
```

原生 UI 测试：

```bash
go test -C native ./...
```

## 结构

```
native/
├── main.go            原生入口，只调用 nativeui.Run
├── nativeui/          窗口、图标栏、上下文栏、AI
├── mdedit/            所见即所得编辑器：解析、排版、绘制、光标、输入法、撤销
├── mdoc/              Markdown 模型、渲染、代码高亮、go-latex 公式
├── doc/               文件类型注册表
├── services/          原生 AI HTTP 客户端与遗留服务
└── cmd/muse-native/   显式原生入口命令
```

## AI 配置

设置 →「模型」填写 Base URL、API Key、模型和系统提示，保存到：

`~/Library/Application Support/Muse/ai.json`（权限 0600）

未配置时 AI 面板会显示「设置模型」入口。支持 OpenAI 兼容的流式 `/chat/completions` 接口。

「服务」有两种形式：

- **Magpie 本地网关**：接口地址自动填 `http://127.0.0.1:3425/v1`（magpie 桌面应用的网关默认地址），
  API Key 可留空；点「获取模型」会拉取 magpie 的模型名（如 `opencode-go/deepseek-v4.1-flash`）。
- **自定义**：任意 OpenAI 兼容端点（OpenAI、DeepSeek 或自建网关），按需填写 Key。

## 已知限制

- 段落、标题、列表、引用、表格内的行内公式，以及块级公式与矩阵都由 go-latex 排版；
- Mermaid 支持流程图、时序图、状态图、饼图、类图子集与甘特图子集；高级特性可能回退为代码；
- AI 对话持久化到 chat.json，支持模型发现、插入文档与清空；
- 更新、导出等旧 Electron 时代的功能尚未在原生 UI 中重新实现。
