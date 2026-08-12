<script setup lang="ts">
/**
 * 编辑区顶栏：当前文件名 + 保存状态。
 * 与参考稿一致——不画分割线，靠留白与主区连成一片。
 * 查找 / AI 栏开关 / 展开侧栏等 icon 控制已统一收到底部工具条（StatusBar），
 * 这里只保留文件名与状态。
 * 整条是窗口拖拽区（macOS 无边框窗口靠它移动窗口）。
 */
defineProps<{
  filename: string
  dirty: boolean
  saving: boolean
  /** 是否已打开文档（未打开时不显示文件名与操作） */
  started: boolean
  /** 左栏折叠时红绿灯落在本栏，需要留白 */
  railCollapsed: boolean
  /** macOS：红绿灯浮在左侧栏/顶栏 */
  isMac: boolean
}>()
</script>

<template>
  <header
    class="h-12 shrink-0 flex items-center gap-2 pr-2 app-drag"
    :class="railCollapsed && isMac ? 'pl-[84px]' : 'pl-4'"
  >
    <template v-if="started">
      <span class="text-[13px] font-medium text-fg truncate">{{ filename }}</span>
      <span class="text-[11.5px] text-fg-ghost shrink-0 tabular-nums">
        {{ saving ? '保存中…' : dirty ? '未保存' : '已保存' }}
      </span>
    </template>

    <div class="flex-1" />
  </header>
</template>
