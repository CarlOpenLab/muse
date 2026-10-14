<script setup lang="ts">
/**
 * 左侧栏：顶栏是「文件 / 大纲」两个页签，下面是各自的内容。
 * - 宽度与拖拽调宽沿用 useWorkspace（与文件树共用一份持久化），切页签不改宽度；
 * - 两个页签常驻挂载（v-show 切换），切来切去不丢文件树的展开状态；
 * - 折叠仍由 viewMode.files 控制（⌘⇧L / 底部工具条）。
 */
import { onUnmounted } from 'vue'
import FileTreePanel from './FileTreePanel.vue'
import OutlineList from './OutlineList.vue'
import { useWorkspace } from '../composables/useWorkspace'
import { useLeftPanel } from '../composables/useLeftPanel'
import type { Heading } from '../composables/useOutline'

defineProps<{
  /** 当前打开的文档路径（文件树内高亮） */
  activePath: string | null
  headings: Heading[]
  activeHeading: number
}>()

const emit = defineEmits<{
  open: [path: string]
  jump: [index: number]
}>()

const ws = useWorkspace()
const { leftTab, setTab } = useLeftPanel()

let dragging = false

function startDrag(e: MouseEvent): void {
  e.preventDefault()
  dragging = true
  const startX = e.clientX
  const startW = ws.width.value
  const onMove = (ev: MouseEvent): void => {
    if (!dragging) return
    ws.setWidth(startW + (ev.clientX - startX))
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
onUnmounted(() => {
  dragging = false
})
</script>

<template>
  <aside
    data-export-hide
    class="relative shrink-0 flex flex-col bg-bg border-r border-border-strong select-none"
    :style="{ width: `${ws.width.value}px` }"
  >
    <!-- 页签条（在整窗顶栏之下，无需为红绿灯留白）：整条可拖窗 -->
    <div class="app-drag h-9 shrink-0 flex items-end gap-1 pl-3 pr-2 border-b border-border-subtle">
      <button class="left-tab" :class="{ active: leftTab === 'files' }" @click="setTab('files')">
        文件
      </button>
      <button class="left-tab" :class="{ active: leftTab === 'outline' }" @click="setTab('outline')">
        大纲
      </button>
    </div>

    <FileTreePanel v-show="leftTab === 'files'" :active-path="activePath" @open="emit('open', $event)" />
    <OutlineList v-show="leftTab === 'outline'" :headings="headings" :active="activeHeading" @jump="emit('jump', $event)" />

    <!-- 左栏右边缘拖拽把手 -->
    <div class="left-resizer" title="拖拽调整宽度" @mousedown="startDrag" />
  </aside>
</template>

<style scoped>
.left-tab {
  height: 30px;
  padding: 0 9px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--fg-dim);
  font-size: 12.5px;
  cursor: pointer;
}
.left-tab:hover {
  color: var(--fg);
}
.left-tab.active {
  color: var(--fg);
  font-weight: 500;
  border-bottom-color: var(--fg);
}

.left-resizer {
  position: absolute;
  top: 0;
  right: -3px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
}
.left-resizer:hover {
  background: color-mix(in srgb, var(--fg) 14%, transparent);
}
</style>
