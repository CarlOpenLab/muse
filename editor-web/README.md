# editor-web — RFC-001 M0/M0.5 PoC

Muse 正文画布的 Web 侧 PoC:在 Go/MyGo 原生外壳内,用 WebView 承载
Vditor(方案 C / M0)或 Milkdown(方案 B / M0.5),按 RFC §5.2 桥协议与宿主通信。

> 结论与数据见 [docs/rfc-001-m0-poc-report.md](../docs/rfc-001-m0-poc-report.md)。

## 运行

```bash
cd editor-web
npm install
npm run dev        # http://127.0.0.1:5273
npm test           # 桥协议一致性测试(vitest, 8 条)
npm run build      # 产出 dist/(供未来 go:embed)
```

| URL | 内容 |
| --- | --- |
| `/?editor=milkdown&harness=1` | Milkdown 画布 + 页内原生宿主模拟器 |
| `/?editor=vditor&harness=1` | Vditor 画布 + 页内原生宿主模拟器 |
| `/?editor=…&selftest=1` | 16 个 fixture 的往返自测 |

## 结构

```
src/
├── bridge/protocol.ts   RFC §5.2 消息类型(带 id/revision 约束)
├── bridge/webBridge.ts  Web 侧桥:防抖 200ms、revision 防回写、保存冲刷、id 回显
├── bridge/nativeSim.ts  页内模拟 Go 宿主(harness 模式),桥接检查面板
├── canvasApi.ts         双画布统一接口(命令/选区/主题/粘贴)
├── vditor/main.ts       方案 C 画布(M0)
├── milkdown/main.ts     方案 B 画布(M0.5,commonmark+gfm+history+math+listener)
├── theme/tokens.ts      主题令牌,取自 native/nativeui/app.go
└── fixtures/index.ts    RFC §7 往返语料 + 语义检查 + 规范化规则
```

宿主接入(macOS):`WKScriptMessageHandler` 名 `museNative`,native → web 用
`evaluateJavaScript('museHandle(JSON)')`;协议与语义以 `tests/protocol.test.ts` 为契约。
