# RFC-001 M0/M0.5 PoC 报告(Web 侧)

- **日期**:2026-10-23
- **状态**:Web 侧完成;macOS 宿主(加载/IME/性能)待验证
- **相关**:[rfc-001-editor-engine.md](rfc-001-editor-engine.md)
- **代码**:[`editor-web/`](../editor-web/)(Vite + TS,零框架)

---

## 1. 范围与方法

RFC-001 §4.2 要求先做 M0(Vditor)与 M0.5(Milkdown)两个 PoC,再决定方案 B/C。
本报告覆盖 **Web 侧全部可验证内容**;macOS WKWebView 宿主需要在 macOS 上完成(见 §6)。

验证方法:

1. **桥协议**:按 RFC §5.2 实现 Web 侧桥(`editor-web/src/bridge/`),配 8 条
   vitest 协议一致性测试(握手、防抖、revision、id 回显、保存冲刷、脏消息容错);
2. **原生模拟器**:`?harness=1` 加载页内模拟宿主,完整走一遍
   ready → document.set → 编辑 → document.changed → 保存握手 → theme.set →
   外部修改 → 图片粘贴回插,桥接检查面板逐条显示报文;
3. **往返语料**:16 个 fixture(标题/强调/链接/列表/任务/引用/表格对齐/代码/公式/图片/
   分隔线/HTML/中英混排/超长段落/综合文档),自测页 `?selftest=1` 在真实 DOM 中跑
   「载入 → 导出 → 再载入 → 再导出」,断言两次导出一致 + 语义检查通过;
4. **稳定性**:连续 10 轮「宿主插入 → 编辑 → 保存」无内容丢失;
5. **构建**:`vite build` 成功,双画布自动代码分割(每个编辑器独立 chunk)。

## 2. 结果总览

| RFC M0 验证项 | Vditor 4.0.1 | Milkdown 7.22.3 |
| --- | --- | --- |
| 本地 HTML/JS 资源加载(dev + build) | ✅ | ✅ |
| Markdown 载入(document.set) | ✅ | ✅ |
| Markdown 导出(document.changed / saveRequested) | ✅ | ✅ |
| fixture 往返 | **16/16** | **16/16** |
| 主题切换(theme.set → CSS 变量) | ✅ | ✅ |
| 表格(GFM) | ✅(含对齐语义) | ✅(含对齐语义) |
| 代码围栏 + 语言标记 | ✅ | ✅ |
| 公式($ 行内 / $$ 块级) | ✅ 源码保真 | ✅ KaTeX 渲染 |
| 图片(粘贴 → image.paste → native 落盘 → 插回) | ✅ 桥接链路 | ✅ 桥接链路 |
| 撤销/重做/全选/聚焦/插入/替换命令 | ✅ | ✅ |
| 选区桥(selection.get → id 回显) | ✅(DOM 偏移) | ✅(ProseMirror 偏移) |
| 中文 IME | ⏳ 需真机 | ⏳ 需真机 |
| 连续 10 轮编辑/保存不丢内容 | ✅ | ✅ |

协议单测 8/8;两端构建产物 gzip 后各 ≈ 220KB(编辑器 chunk,已按 ?editor= 分包)。

## 3. 两个画布的对比(M0.5 决策输入)

| 维度 | Vditor | Milkdown |
| --- | --- | --- |
| 集成方式 | 自带 UI 全家桶(工具栏/侧栏/预览),本 PoC 关闭后作纯画布 | ProseMirror 裸画布,样式全由宿主控制 |
| 桥接命令语义 | 公开 API 覆盖 focus/insert/getValue;setTheme 参数形如 ('dark'\|'classic') | 命令即 ProseMirror transaction,undo/redo/selectAll/insert 均为一等公民 |
| 选区桥 | 需自行从 DOM Range 折算纯文本偏移 | 直接 `doc.textBetween` 折算,含结构位置 |
| 序列化 | 保真度高;任务勾选导出为大写 `[X]` | 缺省 bullet 用 `*`;可自定义 serializer 规则 |
| 公式 | wysiwyg 内以源码保真,预览渲染依赖配置 | plugin-math + KaTeX 画布内直接渲染 |
| 与旧 `app/` 栈的亲缘 | 无 | 同为 Milkdown 7.22,旧代码可参考 |
| 扩展性(AI 选区、diff、块扩展) | 成品化,深定制受限 | ProseMirror 插件生态,自由度高 |
| 体积(编辑器 chunk,gzip) | ≈ 221KB | ≈ 220KB |

## 4. 规范化记录(RFC §7 附录要求)

以下差异为**语义等价的格式规范化**,已在 fixture 检查中放行并记录:

1. 两个引擎都会:统一换行、去掉行尾空白、折叠 3+ 空行、表格分隔行缩短横线
   (`:---:` → `:-:`,对齐由冒号位置决定,语义保持);
2. Milkdown 缺省 bullet 序列化为 `*`(载入 `-` 正常);如需统一为 `-`,
   在 M2 自定义 serializer 规则即可;
3. Vditor 任务勾选导出大写 `[X]`(GFM 规定大小写等价);
4. 表格列对齐两个引擎都保留(冒号位置);
5. HTML 块两个引擎都原样保留。

**未发现真丢失**:16 个 fixture 的语义检查全部通过。

## 5. 过程中发现并修复的问题

1. **document.set 后异步回发 document.changed**(Milkdown 的 markdownUpdated 在
   replaceAll 之后异步触发,同步标志拦不住)→ 改为时间窗抑制;
   Vditor 的 setValue 为同步,标志即可。这是 RFC §8「桥接竞态/回写循环」风险的真实样例,
   修复后:`document.set` 之后 0 次回发,revision 稳定;
2. Vditor 暗色主题下表格/引用/代码块仍是浅色样式 → 已用 Muse 令牌覆盖;
3. 编辑器 chunk > 500KB 警告 → 已按编辑器分包,宿主按需加载一个画布,可接受;
   若 M1 后仍偏大,考虑 katex 按需字体与 shiki 懒加载。

## 6. macOS 宿主侧待验证(下一步)

> **补充(2026-10-23)**:本机(无 GPU 的 Linux 沙箱)实测——`go build -C native .`
> 在 **Linux 上直接成功**(23.8MB 单一二进制),应用完整运行:菜单、文件栏、图标栏、
> 编辑卡、设置对话框、明暗主题切换、原地编辑全部正常;无 GPU 时 MyGo 自动降级 CPU
> 绘制;`go vet ./...` 与全量 `go test ./...`(含 nativeui headless 测试)全部通过。
> 截图见 [images/native-app-dark.png](images/native-app-dark.png)、
> [images/native-app-light.png](images/native-app-light.png)。
> 这意味着宿主开发不依赖 macOS;仅 WKWebView 的三平台实现仍按 RFC §5.1 分平台处理。

Web 侧已把宿主职责压到最小,Go 侧需要实现(RFC §5.1/§5.2):

1. `WKWebView` 宿主 + `WKScriptMessageHandler`(名 `museNative`),native → web
   用 `evaluateJavaScript("museHandle(JSON)")`;
2. feature flag `MUSE_EDITOR=web|native`(默认 native);
3. `go:embed editor-web/dist`;
4. 真机验证项:**中文/日文 IME**、`file://` 资源加载与 CSP、冷启动/内存对比、
   `document.changed` 在真机上的节流表现、外链 `link.open` → 系统浏览器。

## 7. 结论与建议

- 两个画布都**通过了 Web 侧全部可验证的 M0/M0.5 验收条件**;
- 建议按 RFC §4.2 进入 macOS 宿主验证阶段;宿主验证通过后,
  **倾向方案 B(Milkdown)**:与旧 `app/` 同栈、命令/选区桥语义干净、
  AI 选区与块级扩展空间大;Vditor 数据保留,若宿主验证暴露 Milkdown 风险可切换;
- 在宿主验证完成前,不删除现有原生编辑器(RFC §1 决策请求)。
