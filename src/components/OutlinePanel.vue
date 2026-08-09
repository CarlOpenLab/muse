<script setup lang="ts">
import type { Heading as HeadingT } from '../composables/useOutline'

defineProps<{ headings: HeadingT[]; active: number }>()
const emit = defineEmits<{ jump: [index: number] }>()
</script>

<template>
  <aside
    class="w-60 shrink-0 border-l border-border-subtle flex flex-col bg-bg overflow-hidden"
  >
    <!-- 头部：标题（收起开关由卡片右上角的常驻按钮承担，避免动画期出现两个图标） -->
    <div class="flex items-center h-10 shrink-0 px-4">
      <span
        class="text-[11px] font-medium text-fg-soft uppercase tracking-wider select-none"
      >
        大纲
      </span>
    </div>

    <!-- 标题列表（Notion 风格：无折叠箭头，按层级缩进，hover/active 高亮） -->
    <div v-if="headings.length" class="flex-1 overflow-y-auto px-2 pb-3">
      <button
        v-for="h in headings"
        :key="h.index"
        type="button"
        class="outline-item"
        :data-level="h.level"
        :class="{ active: h.index === active }"
        :title="h.text"
        @click="emit('jump', h.index)"
      >
        {{ h.text }}
      </button>
    </div>

    <!-- 空状态 -->
    <div v-else class="flex-1 flex items-center justify-center px-4">
      <div class="text-xs text-fg-soft text-center">
        <div>暂无大纲</div>
        <div class="text-[11px] opacity-60 mt-1">添加标题后会显示在这里</div>
      </div>
    </div>
  </aside>
</template>
