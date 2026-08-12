<script setup lang="ts">
/** 编辑区底部信息条：不画分割线、不换底色，只留一行灰字（对齐参考稿的页脚元信息行） */
import { Folder } from '@lucide/vue'
import type { DocStats } from '../composables/useDocStats'

defineProps<{
  stats: DocStats
  /** 文档位置：工作区内显示相对路径，外部文件显示完整路径，未命名为空 */
  location: string
  path: string | null
}>()
</script>

<template>
  <footer
    class="h-8 shrink-0 flex items-center justify-between gap-3 px-4 text-[11.5px] text-fg-dim select-none"
  >
    <!-- 文件名与保存状态由顶栏承担，这里只补「在哪」这层信息 -->
    <span class="flex items-center gap-1.5 min-w-0" :title="path ?? ''">
      <Folder v-if="location" :size="12" class="shrink-0" />
      <span class="truncate">{{ location }}</span>
    </span>
    <span class="shrink-0 tabular-nums flex items-center gap-3">
      <span>{{ stats.words }} 字</span>
      <span>{{ stats.chars }} 字符</span>
      <span>{{ stats.lines }} 行</span>
    </span>
  </footer>
</template>
