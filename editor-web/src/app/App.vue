<script setup lang="ts">
/**
 * Muse 的 WebView 画布（RFC-001 目标方案）：Vue 3 只做壳，正文是
 * Milkdown/ProseMirror 文档树——渲染即编辑，没有"读态 ↔ 编辑态"的切换，
 * 所以不存在原生路线的点击跳变/闪烁问题。宿主（Go/MyGo）通过 mygo 桥
 * 推送 document.set / theme.set，画布以 document.changed 回报。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { create } from '../milkdown/main';
import { applyTokens } from '../theme/tokens';
import { WebBridge } from '../bridge/webBridge';
import type { CanvasEditor } from '../canvasApi';
import type { ThemeName } from '../bridge/protocol';

const canvasEl = ref<HTMLDivElement | null>(null);
const theme = ref<ThemeName>('dark');
const ready = ref(false);

let canvas: CanvasEditor | null = null;
let bridge: WebBridge | null = null;

onMounted(async () => {
  try {
    await mountCanvas();
  } catch (err) {
    (window as unknown as { __museMountError?: string }).__museMountError = String(err);
    throw err;
  }
});

async function mountCanvas() {
  if (!canvasEl.value) return;
  canvas = await create(canvasEl.value);
  bridge = new WebBridge({
    editorName: canvas.name,
    editorVersion: canvas.version,
    getMarkdown: () => canvas?.getMarkdown() ?? '',
    runCommand: (name, args) => canvas?.runCommand(name, args) ?? false,
    // 空文件时 markdown 可能为 undefined（历史上 Go omitempty 丢过空串），
    // 防御性兜底为空串，绝不让画布停留在上一个文档。
    setDocument: (md) => canvas?.setMarkdown(md ?? ''),
    setTheme: (t, tokens) => {
      // tokens 写在 :root（applyTokens）——milkdown 的 setTheme 是空操作，
      // 正文配色/字号全靠这些 CSS 变量，切换主题必须在这里应用。
      theme.value = t;
      applyTokens(t, tokens);
    },
    getSelection: () => canvas?.getSelection() ?? { from: -1, to: -1, text: '' },
  });
  canvas.onContentChanged(() => bridge?.contentChanged(canvas?.getMarkdown() ?? ''));
  canvas.onSelectionChanged((sel) => bridge?.selectionChanged(sel));
  canvas.onLinkOpen((href) => bridge?.linkOpen(href));
  canvas.onImagePaste((mime, base64) => bridge?.imagePaste(mime, base64));
  bridge.start();
  ready.value = true;
  (window as unknown as { __museBridge?: WebBridge }).__museBridge = bridge;
  // 调试/E2E 钩子：无宿主时也能从控制台或测试驱动画布。
  (window as unknown as { __museCanvas?: CanvasEditor }).__museCanvas = canvas;
  // Outside the app (browser tab, e2e) no host ever pushes document.set;
  // load a demo so the canvas is self-sufficient.
  if (!window.mygo) {
    canvas.setMarkdown(
      [
        '# 一级标题',
        '',
        '正文段落，直接在这里编辑，没有 # 号。',
        '',
        '## 二级标题',
        '',
        '- 无序列表第一项',
        '- 无序列表第二项',
        '',
        '1. 有序列表第一项',
        '2. 有序列表第二项',
        '',
        '> 引用一行',
        '',
        '- [ ] 任务清单未完成',
        '- [x] 任务清单已完成',
        '',
        '```ts',
        "const muse = 'webview';",
        '```',
        '',
        '$$E = mc^2$$',
        '',
        '| 列一 | 列二 |',
        '| --- | --- |',
        '| 甲 | 乙 |',
        '',
        '---',
        '',
        '### 三级标题收尾',
      ].join('\n'),
    );
  }
}


onBeforeUnmount(() => {
  canvas?.destroy?.();
  canvas = null;
  bridge = null;
});
</script>

<template>
  <div class="muse-app" :data-theme="theme" :data-ready="ready">
    <div ref="canvasEl" id="canvas" class="shell-canvas muse-web-canvas"></div>
  </div>
</template>

/* hmr probe 1792913455 */
