<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { Search, X, ArrowUp, ArrowDown } from '@lucide/vue'
import { useSearch } from '../composables/useSearch'

const { query, replaceText, isOpen, matches, current, request, close } = useSearch()

const inputRef = ref<HTMLInputElement | null>(null)

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
    class="search-bar fixed top-3 left-1/2 -translate-x-1/2 z-20 w-[430px] flex flex-col gap-1.5 rounded-lg border border-border-subtle bg-bg shadow-lg p-2"
  >
    <div class="flex items-center gap-1.5">
      <Search :size="14" class="shrink-0 text-fg-soft" />
      <input
        ref="inputRef"
        v-model="query"
        class="flex-1 min-w-0 h-7 px-2 rounded bg-bg-soft border border-transparent focus:border-accent focus:outline-none text-sm"
        placeholder="查找"
        @keydown="onKeydown"
      />
      <span class="shrink-0 text-xs text-fg-soft tabular-nums w-10 text-center">
        {{ matches.length ? current + 1 : 0 }}/{{ matches.length }}
      </span>
      <button
        class="w-7 h-7 flex items-center justify-center rounded text-fg-soft hover:bg-bg-soft hover:text-fg transition-colors"
        title="上一个 (⇧⌘G)"
        @click="request('prev')"
      >
        <ArrowUp :size="14" />
      </button>
      <button
        class="w-7 h-7 flex items-center justify-center rounded text-fg-soft hover:bg-bg-soft hover:text-fg transition-colors"
        title="下一个 (⌘G)"
        @click="request('next')"
      >
        <ArrowDown :size="14" />
      </button>
      <button
        class="w-7 h-7 flex items-center justify-center rounded text-fg-soft hover:bg-bg-soft hover:text-fg transition-colors"
        title="关闭 (Esc)"
        @click="close"
      >
        <X :size="14" />
      </button>
    </div>
    <div class="flex items-center gap-1.5">
      <span class="w-[14px] shrink-0" />
      <input
        v-model="replaceText"
        class="flex-1 min-w-0 h-7 px-2 rounded bg-bg-soft border border-transparent focus:border-accent focus:outline-none text-sm"
        placeholder="替换为"
        @keydown="onKeydown"
      />
      <button
        class="h-7 px-2.5 rounded text-xs border border-border-subtle text-fg-soft hover:text-fg hover:bg-bg-soft transition-colors shrink-0"
        @click="request('replace')"
      >
        替换
      </button>
      <button
        class="h-7 px-2.5 rounded text-xs border border-border-subtle text-fg-soft hover:text-fg hover:bg-bg-soft transition-colors shrink-0"
        @click="request('replaceAll')"
      >
        全部
      </button>
    </div>
  </div>
</template>
