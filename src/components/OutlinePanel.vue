<script setup lang="ts">
import { List } from '@lucide/vue'
import type { Heading } from '../composables/useOutline'

defineProps<{ headings: Heading[] }>()
const emit = defineEmits<{ jump: [index: number]; close: [] }>()
</script>

<template>
  <aside class="w-56 shrink-0 bg-page-bg overflow-y-auto flex flex-col">
    <div
      class="flex items-center justify-between px-4 pt-3 pb-2 text-xs text-fg-soft uppercase tracking-wide select-none"
    >
      <span class="flex items-center gap-1.5"><List :size="13" /> 大纲</span>
      <button
        class="w-5 h-5 flex items-center justify-center rounded hover:bg-bg hover:text-fg transition-colors"
        @click="emit('close')"
        title="收起大纲"
      >
        ✕
      </button>
    </div>
    <ul v-if="headings.length" class="py-1.5 text-sm">
      <li
        v-for="h in headings"
        :key="h.index"
        class="outline-item px-3.5 py-1 cursor-pointer truncate text-fg-soft hover:text-fg hover:bg-bg transition-colors"
        :style="{ paddingLeft: 14 + (h.level - 1) * 14 + 'px' }"
        :title="h.text"
        @click="emit('jump', h.index)"
      >
        {{ h.text }}
      </li>
    </ul>
    <div
      v-else
      class="flex-1 flex items-center justify-center text-xs text-fg-soft opacity-60 py-4"
    >
      暂无标题
    </div>
  </aside>
</template>
