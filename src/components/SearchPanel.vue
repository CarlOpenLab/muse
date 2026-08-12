<script setup lang="ts">
/**
 * 查找替换：作为右栏的一个标签页（与大纲并列），不再是浮在正文顶部的浮条。
 * 上半是查找 / 替换输入，下半是命中列表，点某一条直接跳到正文对应位置。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, Search } from '@lucide/vue'
import { useSearch } from '../composables/useSearch'

const { query, replaceText, matches, current, focusToken, request, close } = useSearch()

const boxRef = ref<HTMLElement | null>(null)

/** 直接抓 DOM input 取焦：a-input 实例的 focus() 在这里拿不到 */
watch(focusToken, () => {
  void nextTick(() => {
    const input = boxRef.value?.querySelector('input')
    input?.focus()
    input?.select()
  })
})

/** 结果多到几千条时列表本身会拖慢渲染，只画前一截并如实说明截断 */
const MAX_LIST = 200
const shown = computed(() => matches.value.slice(0, MAX_LIST))
const truncated = computed(() => matches.value.length - shown.value.length)

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') {
    e.preventDefault()
    request(e.shiftKey ? 'prev' : 'next')
  } else if (e.key === 'Escape') {
    close()
  }
}

/** 点结果：把 current 挪过去再让编辑器跳转并取焦（明确的「去那儿」意图） */
function goto(index: number): void {
  current.value = index
  request('goto')
}
</script>

<template>
  <div ref="boxRef" class="flex-1 min-h-0 flex flex-col">
    <!-- 查找 / 替换 -->
    <div class="shrink-0 flex flex-col gap-1.5 px-3 pb-2.5">
      <div class="flex items-center gap-1.5">
        <a-input
          v-model:value="query"
          size="small"
          placeholder="查找"
          class="flex-1 min-w-0"
          @keydown="onKeydown"
        >
          <template #prefix><Search :size="13" class="text-fg-soft" /></template>
        </a-input>
        <a-tooltip title="上一个 (⇧⌘G)">
          <button type="button" class="rail-icon-btn sm" @click="request('prev')">
            <ArrowUp :size="14" />
          </button>
        </a-tooltip>
        <a-tooltip title="下一个 (⌘G)">
          <button type="button" class="rail-icon-btn sm" @click="request('next')">
            <ArrowDown :size="14" />
          </button>
        </a-tooltip>
      </div>
      <div class="flex items-center gap-1.5">
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

    <!-- 命中计数（无匹配时交给下面的空状态说，不重复一遍） -->
    <div
      v-if="matches.length"
      class="shrink-0 px-3 pb-1.5 text-[11.5px] text-fg-dim tabular-nums select-none"
    >
      第 {{ current + 1 }} / {{ matches.length }} 处
    </div>

    <!-- 结果列表 -->
    <div v-if="matches.length" class="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
      <button
        v-for="(m, i) in shown"
        :key="m.from"
        type="button"
        class="search-item"
        :class="{ active: i === current }"
        :title="m.text"
        @click="goto(i)"
      >
        <span>{{ m.text.slice(0, m.hit) }}</span>
        <span class="search-hit">{{ m.text.slice(m.hit, m.hit + query.length) }}</span>
        <span>{{ m.text.slice(m.hit + query.length) }}</span>
      </button>
      <p v-if="truncated > 0" class="px-2 py-1.5 text-[11px] text-fg-dim">
        另有 {{ truncated }} 处未列出
      </p>
    </div>

    <!-- 空状态 -->
    <div v-else class="flex-1 flex items-center justify-center px-4">
      <div class="text-xs text-fg-soft text-center">
        <div>{{ query ? '没有匹配' : '在当前文档中查找' }}</div>
        <div class="text-[11px] opacity-60 mt-1">
          {{ query ? '换个关键词试试' : 'Enter 跳下一处，⇧Enter 上一处' }}
        </div>
      </div>
    </div>
  </div>
</template>
