<script setup lang="ts">
/**
 * 编辑区顶栏：当前文件名 + 保存状态，右侧放查找 / AI 栏开关。
 * 与参考稿一致——不画分割线，靠留白与主区连成一片。
 * 整条是窗口拖拽区（macOS 无边框窗口靠它移动窗口），按钮上另加 no-drag。
 */
import { PanelLeft, PanelRight, Search } from '@lucide/vue'

defineProps<{
  filename: string
  dirty: boolean
  saving: boolean
  /** 是否已打开文档（未打开时不显示文件名与操作） */
  started: boolean
  /** 左栏是否折叠：折叠时这里补一个展开按钮 */
  railCollapsed: boolean
  /** 右侧 AI 栏是否展开 */
  aiOpen: boolean
  /** 左栏折叠时红绿灯落在本栏，需要留白 */
  isMac: boolean
}>()

const emit = defineEmits<{
  find: []
  'toggle-rail': []
  'toggle-ai': []
}>()
</script>

<template>
  <header
    class="h-12 shrink-0 flex items-center gap-2 pr-2 app-drag"
    :class="railCollapsed && isMac ? 'pl-[84px]' : 'pl-4'"
  >
    <a-tooltip v-if="railCollapsed" title="展开侧栏">
      <button type="button" class="rail-icon-btn" @click="emit('toggle-rail')">
        <PanelLeft :size="16" />
      </button>
    </a-tooltip>

    <template v-if="started">
      <span class="text-[13.5px] text-fg truncate">{{ filename }}</span>
      <span class="text-[11.5px] text-fg-dim shrink-0 tabular-nums">
        {{ saving ? '保存中…' : dirty ? '未保存' : '已保存' }}
      </span>
    </template>

    <div class="flex-1" />

    <div class="app-no-drag flex items-center gap-0.5">
      <a-tooltip title="查找 (⌘F)">
        <button type="button" class="rail-icon-btn" @click="emit('find')">
          <Search :size="16" />
        </button>
      </a-tooltip>
      <a-tooltip :title="aiOpen ? '收起 AI 栏' : '打开 AI 栏'">
        <button
          type="button"
          class="rail-icon-btn"
          :class="{ on: aiOpen }"
          @click="emit('toggle-ai')"
        >
          <PanelRight :size="16" />
        </button>
      </a-tooltip>
    </div>
  </header>
</template>
