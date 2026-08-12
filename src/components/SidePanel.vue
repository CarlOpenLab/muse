<script setup lang="ts">
/**
 * 右侧辅助栏：与左栏对称的一整栏（不再是浮起的卡片），
 * 靠一条 1px 分栏线与编辑区分开，内部与主区同底色——对齐参考稿的三栏观感。
 * - 顶部：窗口拖拽区（搜索 / AI 标签已移除，改由底部工具条 icon 打开/切换）；
 * - 两个插槽常驻挂载（v-show 切换），切标签不丢聊天状态（草稿/流式）。
 */
type PanelTab = 'ai' | 'search'

const props = defineProps<{
  tab: PanelTab
  width: number
}>()

const emit = defineEmits<{
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

    <!-- 顶部无空条：搜索 / AI 内容直接贴顶（不再保留大段拖拽留白） -->

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

/* 芯片式标签样式已随顶部标签移除而废弃 */
</style>
