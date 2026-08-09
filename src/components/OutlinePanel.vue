<script setup lang="ts">
import type { Heading as HeadingT } from '../composables/useOutline'

defineProps<{ headings: HeadingT[]; active: number }>()
const emit = defineEmits<{ jump: [index: number] }>()
</script>

<template>
  <!-- 纯内容版大纲：外层壳（头部标签 / 边框）由 SidePanel 承担，这里只负责滚动列表 -->
  <div
    v-if="headings.length"
    class="flex-1 min-h-0 overflow-y-auto px-2 py-2"
  >
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
</template>
