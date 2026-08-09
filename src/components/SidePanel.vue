<script setup lang="ts">
/**
 * 右侧辅助侧栏：与编辑卡片同款 box card（圆角 / 阴影 / 四周留白一致），
 * 同一位置在「大纲」与「AI」之间切换（Notion AI 式写作辅助）。
 * - 外层只负责宽度（拖拽调宽）与留白，内部是 card-shadow 卡片；
 * - 头部标签：大纲 / AI + 收起按钮；
 * - 两个插槽常驻挂载（v-show 切换），切标签不丢聊天状态（草稿/流式）。
 */
import { ref } from 'vue'
import { ListTree, Sparkles, X } from '@lucide/vue'

const props = defineProps<{
  tab: 'ai' | 'outline'
  width: number
}>()

const emit = defineEmits<{
  'update:tab': [tab: 'ai' | 'outline']
  close: []
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
    class="relative shrink-0 py-3 pr-3 flex flex-col"
    :style="{ width: `${width}px` }"
  >
    <!-- 拖拽把手：悬停变列宽光标（居中于两卡片间隙） -->
    <div class="sidebar-resizer" title="拖拽调整宽度" @mousedown="startDrag" />

    <!-- box card：与编辑卡片同款圆角 / 阴影 / 白底 -->
    <div class="relative rounded-xl card-shadow flex-1 flex flex-col overflow-hidden bg-bg">
      <!-- 标签头：大纲 / AI + 收起 -->
      <div class="h-11 shrink-0 flex items-center gap-1 pl-2 pr-1.5 border-b border-border-subtle select-none">
        <button
          type="button"
          class="sidebar-tab"
          :class="{ active: tab === 'outline' }"
          @click="emit('update:tab', 'outline')"
        >
          <ListTree :size="14" />
          <span>大纲</span>
        </button>
        <button
          type="button"
          class="sidebar-tab"
          :class="{ active: tab === 'ai' }"
          @click="emit('update:tab', 'ai')"
        >
          <Sparkles :size="14" />
          <span>AI</span>
        </button>

        <div class="flex-1" />

        <a-button
          type="text"
          shape="circle"
          size="small"
          class="!text-fg-soft"
          title="收起侧栏"
          @click="emit('close')"
        >
          <template #icon><X :size="14" /></template>
        </a-button>
      </div>

      <!-- 内容：两个插槽常驻挂载，切标签只改可见性（聊天草稿/流式不丢） -->
      <div class="flex-1 min-h-0 flex flex-col">
        <div v-show="tab === 'outline'" class="flex-1 min-h-0 flex flex-col">
          <slot name="outline" />
        </div>
        <div v-show="tab === 'ai'" class="flex-1 min-h-0 flex flex-col">
          <slot name="ai" />
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-resizer {
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: -6px;
  width: 6px;
  z-index: 30;
  cursor: col-resize;
}
.sidebar-resizer:hover {
  background: color-mix(in srgb, var(--fg-soft) 18%, transparent);
  border-radius: 3px;
}

/* 标签按钮：紧凑 pill */
.sidebar-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 11px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--fg-soft);
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 140ms ease,
    color 140ms ease;
}
.sidebar-tab:hover {
  background: var(--bg-soft);
  color: var(--fg);
}
.sidebar-tab.active {
  background: color-mix(in srgb, var(--fg) 10%, transparent);
  color: var(--fg);
}
</style>
