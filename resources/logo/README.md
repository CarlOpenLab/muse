# Muse App Icon — “Page Muse”

用 `design-playful-app-icons` 的规则完成。产品 brief 归结为：

**纸页（object） + 落笔（action） + 机灵、友好（emotion）**

最终选择扁平描边路线（`flat_outlined_mascot`），而不是 3D 或渐变剪影：Muse 是编辑器，纸页本身就是最直接的产品隐喻；重描边 + 平面色块在 32 px 启动器尺寸下最稳。

## 三个方向

| 方向 | 隐喻 | 路线 | 轮廓 / 钩子 | 结论 |
| --- | --- | --- | --- | --- |
| **01 Page Muse（采用）** | 一张会写字的纸 | Flat outlined mascot | 圆角纸页 + 金色折角 + 收成笔尖的底边；眨眼 + 坏笑 | 32 px 仍能读出“纸页 + 脸”，金色折角成为记忆点 |
| 02 Nib Pen | 会自己写字的钢笔 | Flat outlined mascot | 斜置钢笔 + 金色笔夹 + 笔尖拖出一条线 | 1024/60 很有性格，但 32 px 脸部只剩两个点；备选 |
| 03 Paper Flight | 文字起飞 | Gradient silhouette | 由纸页折成的纸飞机 + 文字条 | 轮廓清晰，但容易读成通用“发送”图标，且缺少角色感；淘汰 |

三个方向的 1024 px 记录在 `concepts/`。

## 最终方案

- **Lane**: `flat_outlined_mascot`
- **调色板**: `violet_tech`
  - dominant `#4237C6`（背景，径向 #4C41D6 → #3A2FB2）
  - neutral `#F8F6F5`（纸页）
  - ink `#121212`（描边与五官）
  - accent `#FDDA34`（金色折角）
- **几何**: 纸页约 464 × 720（旋转 -5°），占画面高度约 73%；外描边 44 px @1024（≈1.4 px @32）；折角 140 px；底边收成笔尖形，不画镂空孔洞，避免小尺寸出现“钥匙孔/气球”误读。
- **脸**: 2 个眼（左眼圆点 + 右眼眨眼弧）+ 1 个微笑，共 3 个特征；右眼偏移、整体 -5° 倾斜制造态度。
- **签名钩子**: 金色折角（32 px 仍可见）+ 底边笔尖收口（大尺寸的第二层含义）。全身只有这一处高亮强调。
- **背景**: 全出血、安静、无图案；亮/暗启动器下主体都能靠纸页白色分离。
- **无文字、无边框、无烘焙圆角、无透明通道。**

## 质量报告

```text
Lane: flat_outlined_mascot
Metaphor: page + writing + clever/friendly
Palette: violet_tech — #4237C6 / #F8F6F5 / #121212 / #FDDA34
Signature hook: gold dog-ear + nib-tapered page bottom
Score: 91/100
Small-size result: 32 px reads page + two eyes + smile + gold corner; nib taper is a bonus, not required for recognition
Production status: ready (1024 opaque sRGB, no alpha, no corner mask; .icns included)
```

| 维度 | 得分 | 说明 |
| --- | ---: | --- |
| 产品含义 | 18/20 | 纸页直接对应文档编辑器；笔尖收口暗示书写 |
| 轮廓 | 18/20 | 纯黑剪影下仍是“带折角的纸页” |
| 小尺寸清晰度 | 18/20 | 32 px 下脸与金色折角都还在 |
| 颜色与对比 | 15/15 | 紫 / 白 / 墨 / 金，灰度分离明确 |
| 风格一致性 | 10/10 | 全程扁平色块 + 重描边，无半渲染 |
| 原创性 | 7/10 | 纸页吉祥物不新，但金色折角 + 笔尖底边 + 眨眼组合是原创配置 |
| 平台就绪 | 5/5 | 不透明 1024 PNG、icns、32/60/180 全齐 |

门禁检查：无需文字解释；32 px 剪影不歧义；单一主体；关键特征未出安全区；无已知品牌/角色相似；无烘焙圆角、无透明通道。

## 可复现提示词

```text
Square app icon for a native Markdown editor called Muse. A single original
friendly paper-page character, tilted about 5 degrees, with a heavy smooth dark
contour, one gold folded dog-ear at the top-right, and a bottom edge tapering
into a fountain-pen-nib silhouette. Broad flat shapes, crisp flat color
separation, two eyes (one dot, one wink) and a short asymmetric smile conveying
a clever, friendly attitude. One signature hook: the gold dog-ear. Palette
violet_tech — deep violet background #4237C6, soft-white page #F8F6F5, ink
#121212, gold accent #FDDA34. Edge-to-edge quiet background, subject filling
about 70-85% of the square, readable at 32 px, no text, no tiny details, no
thin strokes, no keyhole cutouts, no existing logo, no known character, no
artist imitation.
```

## 文件

- `muse-icon.svg` — 矢量源文件
- `muse-icon-1024.png` — 不透明 sRGB，1024 × 1024（iOS / 通用母版）
- `muse-icon-180.png` / `muse-icon-60.png` / `muse-icon-32.png` — 启动器评审尺寸
- `muse-icon.icns` — macOS 图标集
- `preview.png` — 亮/暗启动器四尺寸预览
- `launcher-preview.png` — macOS 圆角遮罩模拟（仅预览，资产本身不烘焙圆角）
- `compare-with-current.png` — 与当前 Muse 图标的对比
- `concepts/` — 三个方向的 1024 px 记录与 SVG

## 采用方式

图标已采用（2026-11-05）：

- `resources/icon.png` ← `muse-icon-1024.png`（不透明 sRGB，1024 × 1024）
- `resources/icon.icns` ← `muse-icon.icns`（`iconutil` 可解出 16–1024 的全部尺寸；PNG 数据经 `pngcrush -brute` 无损重压，898 KB → 516 KB）
- `website/assets/img/favicon.png` 由同一图标生成（180 px，圆角只在网页呈现时加，不写回母版）
- `website/assets/img/og.jpg` 由同一图标生成（1200 × 630 社交卡片，字标 + 「所写，即所见。」）

重新生成时，先改 `muse-icon.svg`，再导出 1024 px 母版和各尺寸；`resources/icon.png` 必须保持不透明、无烘焙圆角。Windows 的 `.ico` 仍未接入构建。
