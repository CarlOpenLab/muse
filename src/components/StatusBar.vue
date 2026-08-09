<script setup lang="ts">
import type { DocStats } from '../composables/useDocStats'

defineProps<{
  stats: DocStats
  filename: string
  dirty: boolean
  path: string | null
}>()
</script>

<template>
  <footer
    class="h-6 shrink-0 flex items-center justify-between px-3 text-xs text-fg-soft bg-bg-soft border-t border-border-subtle select-none"
  >
    <span class="truncate" :title="path ?? ''">
      <span v-if="dirty" class="text-accent">● </span>{{ filename
      }}<template v-if="!path">（未保存）</template>
    </span>
    <a-space :size="12" class="shrink-0 tabular-nums">
      <span>{{ stats.words }} 字</span>
      <span>{{ stats.chars }} 字符</span>
      <span>{{ stats.lines }} 行</span>
    </a-space>
  </footer>
</template>
