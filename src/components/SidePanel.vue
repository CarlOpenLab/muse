<script setup lang="ts">
/**
 * 右侧辅助栏：与左栏对称的一整栏（不再是浮起的卡片），
 * 靠一条 1px 分栏线与编辑区分开，内部与主区同底色——对齐参考稿的三栏观感。
 * - 头部：芯片式标签（搜索 / AI）；收起按钮已统一收到底部工具条；
 * - 两个插槽常驻挂载（v-show 切换），切标签不丢聊天状态（草稿/流式）。
 * 文档大纲已改为编辑区右侧的导航竖轨（OutlinePanel），不再占用右栏。
 */
import { Search, Sparkles } from '@lucide/vue'

type PanelTab = 'ai' | 'search'

const props = defineProps<{
  tab: PanelTab
  width: number
}>()

const emit = defineEmits<{
  'update:tab': [tab: PanelTab]
  resize: [width: number]
}>()

// ===== 拖拽调宽 =====
let dragging = false
function startDrag(e: MouseEvent): void {
  e.preventDefault()
  dragging = true
  const startX = e.clientX
  const startW = props.width
  const onMove = (ev: MouseEvent): void => {
    if (!dragging) return
    const next = Math.min(560, Math.max(300, startW + (startX - ev.clientX)))
    emit('resize', next)
  }
  const onUp = (): void => {
    dragging = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}
</script>

<template>
  <aside
    class="relative shrink-0 flex flex-col bg-bg border-l border-border-strong"
    :style="{ width: `${width}px` }"
  >
    <!-- 拖拽把手：悬停变列宽光标 -->
    <div class="sidebar-resizer" title="拖拽调整宽度" @mousedown="startDrag" />

    <!-- 头部：芯片式标签（与左栏 / 编辑区顶栏同高，三栏顶部齐平） -->
    <div class="h-12 shrink-0 flex items-center gap-1.5 pl-3 pr-2 app-drag select-none">
      <button
        type="button"
        class="panel-chip"
        :class="{ active: tab === 'search' }"
        @click="emit('update:tab', 'search')"
      >
        <Search :size="14" />
        <span>搜索</span>
      </button>
      <button
        type="button"
        class="panel-chip"
        :class="{ active: tab === 'ai' }"
        @click="emit('update:tab', 'ai')"
      >
        <Sparkles :size="14" />
        <span>AI</span>
      </button>
    </div>

    <!-- 内容：两个插槽常驻挂载，切标签只改可见性（聊天草稿/流式不丢） -->
    <div class="flex-1 min-h-0 flex flex-col">
      <div v-show="tab === 'search'" class="flex-1 min-h-0 flex flex-col">
        <slot name="search" />
      </div>
      <div v-show="tab === 'ai'" class="flex-1 min-h-0 flex flex-col">
        <slot name="ai" />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -3px;
  width: 6px;
  z-index: 30;
  cursor: col-resize;
}
.sidebar-resizer:hover {
  background: color-mix(in srgb, var(--fg-soft) 18%, transparent);
}

/* 芯片式标签：参考稿右栏头部的那种小圆角标签 */
.panel-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--fg-soft);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition:
    background 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}
.panel-chip:hover {
  color: var(--fg);
  background: var(--bg-hover);
}
.panel-chip.active {
  background: var(--bg-elev);
  border-color: var(--border-strong);
  color: var(--fg);
}
</style>
