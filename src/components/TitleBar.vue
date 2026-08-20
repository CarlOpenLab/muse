<script setup lang="ts">
/**
 * 编辑区顶栏：当前文件名 + 保存状态。
 * 与参考稿一致——不画分割线，靠留白与主区连成一片。
 * 查找 / AI 栏开关 / 新建 / 打开等 icon 控制已统一收到底部工具条（StatusBar），
 * 这里只保留文件名与状态。
 * 整条是窗口拖拽区（macOS 无边框窗口靠它移动窗口）；红绿灯浮在左侧，故 mac 下左留白。
 */
defineProps<{
  filename: string
  dirty: boolean
  saving: boolean
  /** 是否已打开文档（未打开时不显示文件名与操作） */
  started: boolean
  /** macOS：红绿灯浮在顶栏左侧，需要留白 */
  isMac: boolean
  /** 文档位置：工作区内显示相对路径，外部文件显示完整路径，未命名为空 */
  location: string
  /** 当前文件完整路径（hover 时显示完整路径） */
  path: string | null
}>()

const emit = defineEmits<{
  /** 点击路径：在系统文件管理器中打开所在文件夹 */
  reveal: []
  /** 点击文件名：Typora 式交互（已保存文件可重命名，未命名则聚焦标题） */
  editTitle: []
}>()
</script>

<template>
  <header
    class="h-12 shrink-0 flex items-center justify-center gap-2 pr-2 app-drag relative"
    :class="isMac ? 'pl-[84px]' : 'pl-4'"
  >
    <template v-if="started">
      <div class="flex items-center justify-center gap-2 max-w-[70%] mx-auto">
        <span
          class="app-no-drag text-[13px] font-medium text-fg truncate cursor-pointer hover:opacity-70 transition-opacity text-center"
          title="点击编辑标题/重命名"
          @click="emit('editTitle')"
        >{{ filename }}</span>
        <span
          v-if="saving"
          class="text-[11.5px] text-fg-ghost shrink-0 tabular-nums"
        >保存中…</span>
        <span
          v-if="path"
          class="app-no-drag text-[11.5px] text-fg-dim truncate cursor-pointer transition-colors hover:text-fg"
          @click="emit('reveal')"
        >{{ location }}</span>
      </div>
    </template>
  </header>
</template>
