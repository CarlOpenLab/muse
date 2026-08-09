<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { Search, X, ArrowUp, ArrowDown } from '@lucide/vue'
import { useSearch } from '../composables/useSearch'

const { query, replaceText, isOpen, matches, current, request, close } = useSearch()

const inputRef = ref<{ focus: () => void } | null>(null)

watch(isOpen, (open) => {
  if (open) void nextTick(() => inputRef.value?.focus())
})

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') {
    e.preventDefault()
    request(e.shiftKey ? 'prev' : 'next')
  } else if (e.key === 'Escape') {
    close()
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed top-3 left-1/2 -translate-x-1/2 z-20 w-[430px] flex flex-col gap-1.5 rounded-lg border border-border bg-bg shadow-lg p-2"
  >
    <div class="flex items-center gap-1.5">
      <a-input
        ref="inputRef"
        v-model:value="query"
        size="small"
        placeholder="查找"
        class="flex-1 min-w-0"
        @keydown="onKeydown"
      >
        <template #prefix><Search :size="14" class="text-fg-soft" /></template>
      </a-input>
      <span class="shrink-0 text-xs text-fg-soft tabular-nums w-10 text-center">
        {{ matches.length ? current + 1 : 0 }}/{{ matches.length }}
      </span>
      <a-tooltip title="上一个 (⇧⌘G)">
        <a-button size="small" type="text" @click="request('prev')">
          <template #icon><ArrowUp :size="14" /></template>
        </a-button>
      </a-tooltip>
      <a-tooltip title="下一个 (⌘G)">
        <a-button size="small" type="text" @click="request('next')">
          <template #icon><ArrowDown :size="14" /></template>
        </a-button>
      </a-tooltip>
      <a-tooltip title="关闭 (Esc)">
        <a-button size="small" type="text" @click="close">
          <template #icon><X :size="14" /></template>
        </a-button>
      </a-tooltip>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="w-[14px] shrink-0" />
      <a-input
        v-model:value="replaceText"
        size="small"
        placeholder="替换为"
        class="flex-1 min-w-0"
        @keydown="onKeydown"
      />
      <a-button size="small" class="shrink-0" @click="request('replace')">替换</a-button>
      <a-button size="small" class="shrink-0" @click="request('replaceAll')">全部</a-button>
    </div>
  </div>
</template>
