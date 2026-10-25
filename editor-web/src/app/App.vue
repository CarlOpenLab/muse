<script setup lang="ts">
/**
 * Muse 的 WebView 画布（RFC-001 目标方案）：Vue 3 只做壳，正文是
 * Milkdown/ProseMirror 文档树——渲染即编辑，没有"读态 ↔ 编辑态"的切换，
 * 所以不存在原生路线的点击跳变/闪烁问题。宿主（Go/MyGo）通过 mygo 桥
 * 推送 document.set / theme.set，画布以 document.changed 回报。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { create } from '../milkdown/main';
import { applyTokens } from '../theme/tokens';
import { WebBridge } from '../bridge/webBridge';
import type { BlockInfo, CanvasEditor } from '../canvasApi';
import type { ThemeName } from '../bridge/protocol';

const canvasEl = ref<HTMLDivElement | null>(null);
const theme = ref<ThemeName>('dark');
const ready = ref(false);

let canvas: CanvasEditor | null = null;
let bridge: WebBridge | null = null;

// 结构导航 rail（antd message-scroller 源码对齐：距离衰减刻度 + 单例滑动预览卡）
const railBlocks = ref<BlockInfo[]>([]);
const railActive = ref(0);
const railHovered = ref(-1); // 指针悬停的刻度（触屏不参与）
const railFocused = ref(-1); // 键盘 focus-visible 的刻度
const railOverflow = ref(false); // 内容溢出才显示导轨
const railItemH = ref(14); // 单刻度高：视口装不下时 14→6 压缩
let railObserver: ResizeObserver | null = null;
// 点击刻度后的选中锁：平滑滚动会连续发 scroll 事件，位置判定会把激活项算到相邻块
// （首尾块无法居中时必然错位）。源码用 PROGRAMMATIC_SCROLL_WINDOW 遮挡这段；这里锁到
// 读者真的滚动/键入为止，保证被点的那条刻度一直是 active。
let railPinned = -1;

const RAIL_INSET = 12;
const DEFAULT_RAIL_ITEM_H = 14;
const MIN_RAIL_ITEM_H = 6;
const RAIL_SCALE_STEPS = [1, 0.68, 0.44];
const RAIL_SCALE_FLOOR = 0.25;
const PREVIEW_TITLE_LENGTH = 56;
const PREVIEW_DESCRIPTION_LENGTH = 88;

/** 离高亮项的距离衰减（源码 resolveRailScale 的鱼眼效应）。 */
function railScale(distance: number): number {
  return RAIL_SCALE_STEPS[distance] ?? RAIL_SCALE_FLOOR;
}

/** 卡片激活优先级：悬停 > 聚焦（源码 hovered ?? pinned ?? focused）；滚动只亮刻度不弹卡。 */
const railCard = computed(() => (railHovered.value >= 0 ? railHovered.value : railFocused.value));
/** 高亮优先级：显式激活的刻度 > 滚动定位出的当前项。 */
const railHighlight = computed(() => (railCard.value >= 0 ? railCard.value : railActive.value));

function railPreviewTransform(cardIdx: number): string {
  const count = railBlocks.value.length;
  if (cardIdx < 0 || !count) return 'translateY(0)';
  const h = railItemH.value;
  return `translateY(${(cardIdx + 0.5) * h - (count * h) / 2}px)`;
}

/** 源码 resolveElementPreview：首 56 字作标题，余下 88 字作描述。 */
function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const excerpt = text.slice(0, limit);
  const boundary = excerpt.lastIndexOf(' ');
  return `${excerpt.slice(0, boundary > limit * 0.65 ? boundary : limit).trim()}…`;
}

function previewOfBlock(b: BlockInfo): { title: string; description: string } {
  const text = b.text.replace(/\s+/g, ' ').trim();
  if (!text) return { title: kindLabel(b.kind), description: '' };
  if (text.length <= PREVIEW_TITLE_LENGTH) return { title: text, description: '' };
  const excerpt = text.slice(0, PREVIEW_TITLE_LENGTH);
  const boundary = excerpt.lastIndexOf(' ');
  const titleEnd = boundary > PREVIEW_TITLE_LENGTH * 0.65 ? boundary : PREVIEW_TITLE_LENGTH;
  return {
    title: `${text.slice(0, titleEnd).trim()}…`,
    description: truncateText(text.slice(titleEnd).trim(), PREVIEW_DESCRIPTION_LENGTH),
  };
}

const railPreviewCard = computed(() => {
  const block = railBlocks.value[railCard.value];
  return block ? previewOfBlock(block) : null;
});

function computeRailMetrics() {
  const el = canvasEl.value;
  if (!el) return;
  const count = railBlocks.value.length;
  railOverflow.value = count > 1 && el.scrollHeight > el.clientHeight + 1;
  if (!railOverflow.value) {
    // 导轨收起时清掉悬停/聚焦，避免下次浮现时残留上一次的预览卡。
    railHovered.value = -1;
    railFocused.value = -1;
    railPinned = -1;
  }
  if (!count) {
    railItemH.value = DEFAULT_RAIL_ITEM_H;
    return;
  }
  const available = el.clientHeight - RAIL_INSET * 2;
  railItemH.value =
    available > 0
      ? Math.min(DEFAULT_RAIL_ITEM_H, Math.max(MIN_RAIL_ITEM_H, Math.floor(available / count)))
      : DEFAULT_RAIL_ITEM_H;
}

function refreshRail() {
  if (!canvas?.getBlocks) return;
  railPinned = -1;
  railBlocks.value = canvas.getBlocks();
  railActive.value = canvas.getActiveBlock?.() ?? 0;
  computeRailMetrics();
}

/** 触屏没有悬停：pointerenter 只在鼠标/笔上激活卡片（源码同样忽略 touch）。 */
function onRailPointerEnter(event: PointerEvent, index: number) {
  if (event.pointerType !== 'touch') railHovered.value = index;
}

/** 触屏按下即点亮并锁定卡片，直到点导轨外（桌面端的点击不弹卡）。 */
function onRailPointerDown(event: PointerEvent, index: number) {
  railFocused.value = -1;
  if (event.pointerType !== 'mouse') railHovered.value = index;
}

/** 只有 focus-visible（键盘）才弹卡，鼠标点击后的 focus 不算。 */
function onRailFocus(event: FocusEvent, index: number) {
  if ((event.currentTarget as HTMLElement | null)?.matches(':focus-visible')) railFocused.value = index;
}

/**
 * 滚动只更新高亮刻度，不弹预览卡（源码 handleScroll → rail.updateActive）。
 *
 * 与 antd 一样逐次同步判定：节流会让高亮落后一次滚动，位置判定本身只读布局。
 */
function handleCanvasScroll() {
  if (railPinned >= 0) return;
  railActive.value = canvas?.getActiveBlock?.() ?? 0;
}

/** 读者自己滚动/键入/点回正文时解锁，之后的位置判定重新接管高亮。 */
function releaseRailPin() {
  railPinned = -1;
}

function jumpTo(b: BlockInfo, index: number) {
  railPinned = index;
  railActive.value = index;
  canvas?.runCommand('scrollToBlock', { pos: b.from });
}

const KIND_LABELS: Record<string, string> = {
  heading: '标题',
  paragraph: '段落',
  bullet_list: '列表',
  ordered_list: '有序列表',
  list_item: '列表项',
  blockquote: '引用',
  code_block: '代码',
  math_block: '公式',
  table: '表格',
  hr: '分割线',
  html_block: 'HTML',
};

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

onMounted(async () => {
  try {
    await mountCanvas();
  } catch (err) {
    const stack = err instanceof Error ? err.stack : '';
    (window as unknown as { __museMountError?: string }).__museMountError = String(err) + (stack ? ' :: ' + stack.split('\n').slice(1, 4).join(' | ') : '');
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
  canvas.onDocChanged?.(() => refreshRail());
  canvas.onSelectionChanged((sel) => bridge?.selectionChanged(sel));
  canvas.onLinkOpen((href) => bridge?.linkOpen(href));
  canvas.onImagePaste((mime, base64) => bridge?.imagePaste(mime, base64));
  bridge.start();
  ready.value = true;
  (window as unknown as { __museBridge?: WebBridge }).__museBridge = bridge;
  // 结构导航 rail：块列表 + 滚动跟随高亮（scroll 事件内同步判定）。
  refreshRail();
  canvasEl.value?.addEventListener('scroll', handleCanvasScroll);
  canvasEl.value?.addEventListener('wheel', releaseRailPin, { passive: true });
  canvasEl.value?.addEventListener('touchstart', releaseRailPin, { passive: true });
  canvasEl.value?.addEventListener('keydown', releaseRailPin);
  canvasEl.value?.addEventListener('pointerdown', releaseRailPin);
  // 尺寸变化同时影响溢出判定与单刻度高度（antd 用 ResizeObserver 观察视口）。
  railObserver = new ResizeObserver(() => computeRailMetrics());
  if (canvasEl.value) railObserver.observe(canvasEl.value);
  window.addEventListener('resize', computeRailMetrics);
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
  railObserver?.disconnect();
  railObserver = null;
  canvasEl.value?.removeEventListener('scroll', handleCanvasScroll);
  canvasEl.value?.removeEventListener('wheel', releaseRailPin);
  canvasEl.value?.removeEventListener('touchstart', releaseRailPin);
  canvasEl.value?.removeEventListener('keydown', releaseRailPin);
  canvasEl.value?.removeEventListener('pointerdown', releaseRailPin);
  window.removeEventListener('resize', computeRailMetrics);
  canvas?.destroy?.();
  canvas = null;
  bridge = null;
});
</script>

<template>
  <div class="muse-app" :data-theme="theme" :data-ready="ready">
    <div ref="canvasEl" id="canvas" class="shell-canvas muse-web-canvas"></div>
    <nav
      v-if="railOverflow && railBlocks.length > 1"
      class="muse-rail"
      aria-label="文档结构导航"
      @pointerleave="railHovered = -1"
    >
      <button
        v-for="(b, i) in railBlocks"
        :key="i"
        type="button"
        class="muse-rail-item"
        :data-active="i === railActive ? '' : undefined"
        :data-highlighted="i === railHighlight ? '' : undefined"
        :aria-current="i === railActive ? 'location' : undefined"
        :aria-label="`${kindLabel(b.kind)} ${previewOfBlock(b).title}`"
        :style="{
          height: `${railItemH}px`,
          '--rail-scale': railScale(Math.abs(i - railHighlight)),
        }"
        @pointerenter="onRailPointerEnter($event, i)"
        @pointerdown="onRailPointerDown($event, i)"
        @focus="onRailFocus($event, i)"
        @blur="railFocused = -1"
        @click="jumpTo(b, i)"
      >
        <span class="muse-rail-tick" />
      </button>
    </nav>
    <div
      v-if="railOverflow && railBlocks.length > 1"
      class="muse-rail-preview-layer"
      aria-hidden="true"
    >
      <div class="muse-rail-preview-track" :style="{ transform: railPreviewTransform(railCard) }">
        <div v-if="railPreviewCard" class="muse-rail-preview">
          <div class="muse-rail-preview-title">{{ railPreviewCard.title }}</div>
          <div v-if="railPreviewCard.description" class="muse-rail-preview-desc">
            {{ railPreviewCard.description }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
