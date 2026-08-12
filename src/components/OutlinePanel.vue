<script setup lang="ts">
/**
 * 文章右侧导航竖轨（忠实还原 waku transcript_view 的 ConversationNavigationRail）：
 * - 固定 12px 节距（2px 刻度 + 10px 间距），整轨垂直居中、高最多 80%；
 * - hover 时按与光标刻度距离级联变宽（scale 1 / 0.68 / 0.44 / 0.25），300ms ease_out_quint；
 * - 当前章节刻度常亮（颜色白/主色，宽度仍跟随 hover）；
 * - hover 显示预览卡片（层级 + 标题 14px semibold），点击刻度跳转。
 */
import { computed, ref } from 'vue'
import type { Heading as HeadingT } from '../composables/useOutline'

const props = defineProps<{ headings: HeadingT[]; active: number }>()
const emit = defineEmits<{ jump: [index: number] }>()

const hoverIndex = ref<number | null>(null)
const previewTop = ref(0)

/** hover 的刻度索引：宽度级联只跟随它（waku：scale 只依赖 emphasized） */
const emphasized = computed(() => hoverIndex.value)

/** 刻度最大宽度（右栏场景用 24px；waku 为 32px） */
const TICK_MAX = 24
/** 级联宽度：与 emphasized 距离 0/1/2/≥3 → scale 1/0.68/0.44/0.25（waku navigation_rail_scale） */
function tickWidth(index: number): string {
  const e = emphasized.value
  if (e == null) return `${(TICK_MAX * 0.25).toFixed(1)}px`
  const d = Math.abs(index - e)
  const scale = d === 0 ? 1 : d === 1 ? 0.68 : d === 2 ? 0.44 : 0.25
  return `${(TICK_MAX * scale).toFixed(1)}px`
}

function onSlotEnter(e: MouseEvent, index: number): void {
  hoverIndex.value = index
  const slot = e.currentTarget as HTMLElement
  const rail = slot.offsetParent as HTMLElement | null
  const host = rail?.offsetParent as HTMLElement | null
  if (!rail || !host) return
  // rail 用 transform: translateY(-50%) 垂直居中，实际显示比布局坐标上移 rail 高一半，
  // 这里扣回偏移量，使卡片中心精确对准刻度线（相对编辑区容器）
  const shift = rail.offsetHeight / 2
  const center = rail.offsetTop - shift + slot.offsetTop + slot.offsetHeight / 2
  // waku：卡片高 126，top 限制在 [12, 视口-126-12]，卡片中心随之 clamp
  const cardHalf = 63
  const min = cardHalf + 12
  const max = host.offsetHeight - cardHalf - 12
  previewTop.value = Math.min(Math.max(center, min), max)
}
function onRailLeave(): void {
  hoverIndex.value = null
}
</script>

<template>
  <!-- 竖轨：固定节距排列、整轨垂直居中，贴编辑区右侧 -->
  <div class="editor-rail" @mouseleave="onRailLeave">
    <button
      v-for="h in headings"
      :key="h.index"
      type="button"
      class="outline-tick-slot"
      :class="{ active: h.index === active, emphasized: h.index === hoverIndex }"
      :title="h.text"
      @mouseenter="onSlotEnter($event, h.index)"
      @click="emit('jump', h.index)"
    >
      <span class="outline-tick" :style="{ width: tickWidth(h.index) }" />
    </button>
  </div>

  <!-- hover 预览卡片：纯展示（pointer-events none 不挡正文），随 hover 刻度定位 -->
  <div
    v-if="hoverIndex != null"
    class="outline-preview"
    :style="{ top: `${previewTop}px` }"
    aria-hidden="true"
  >
    <div class="outline-preview-level">H{{ headings[hoverIndex].level }}</div>
    <div class="outline-preview-title">{{ headings[hoverIndex].text }}</div>
  </div>
</template>

<style scoped>
/* 竖轨：waku 同款——固定节距（12px/个）、整轨垂直居中（top 50% + translateY(-50%)）、
 * 高最多 80% */
.editor-rail {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  max-height: 80%;
  overflow: hidden;
  z-index: 10;
  display: flex;
  flex-direction: column;
}

/* 刻度槽：高 = NAVIGATION_RAIL_TURN_HEIGHT（2 + 10），刻度垂直居中、靠右对齐
 * （竖轨贴右侧边缘，线条贴右缘、宽度向左扩展） */
.outline-tick-slot {
  height: 12px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  outline: none;
}

/* 刻度：2px 高圆角条，宽度由 JS 按级联 scale 控制；
 * 颜色：非强调 ghost 45%，hover / 当前章节全亮（waku：prominent 才亮色） */
.outline-tick {
  width: 6px;
  height: 2px;
  border-radius: 9999px;
  background: var(--fg-ghost);
  opacity: 0.45;
  transition:
    width 300ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 150ms ease,
    background 150ms ease;
}
.outline-tick-slot:hover .outline-tick,
.outline-tick-slot.emphasized .outline-tick,
.outline-tick-slot.active .outline-tick {
  background: var(--fg);
  opacity: 1;
}
/* 暗色下当前章节用纯白（waku：dark 强调刻度为白） */
:root.dark .outline-tick-slot.active .outline-tick {
  background: #ffffff;
}

/* 预览卡片：raised 浮层、圆角 14（waku 同规格）、标题 14px semibold；
 * 位于竖轨左侧（right: 52px = 轨道右 14 + 轨道 24 + 间距 14），不拦截鼠标 */
.outline-preview {
  position: absolute;
  right: 52px;
  transform: translateY(-50%);
  width: 300px;
  max-width: calc(100% - 70px);
  max-height: 126px;
  overflow: hidden;
  padding: 12px 15px;
  border: 1px solid var(--border-strong);
  border-radius: 14px;
  background: var(--bg-elev);
  box-shadow:
    0 1px 2px rgb(0 0 0 / 0.06),
    0 12px 32px -8px rgb(0 0 0 / 0.18);
  pointer-events: none;
}
:root.dark .outline-preview {
  box-shadow:
    0 1px 2px rgb(0 0 0 / 0.3),
    0 12px 32px -8px rgb(0 0 0 / 0.5);
}
.outline-preview-level {
  margin-bottom: 4px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--fg-soft);
  font-variant-numeric: tabular-nums;
}
.outline-preview-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--fg);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}
</style>
