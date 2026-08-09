<script setup lang="ts">
import { Feather, FilePlus, FolderOpen, FileText } from '@lucide/vue'

defineProps<{ recent: string[] }>()
const emit = defineEmits<{ new: []; open: []; 'open-recent': [path: string] }>()

// 渲染进程无 node:path，自备 basename
function basename(p: string): string {
  return p.split(/[\\/]/).pop() || p
}
</script>

<template>
  <div class="flex-1 flex overflow-auto p-6">
    <div class="m-auto flex flex-col items-center text-center max-w-[360px] w-full">
      <div
        class="flex items-center justify-center w-14 h-14 mb-4 rounded-2xl text-accent"
        style="background: color-mix(in srgb, var(--accent) 12%, transparent)"
      >
        <Feather :size="28" />
      </div>
      <a-typography-title :level="3" class="!mb-1">md-ai</a-typography-title>
      <a-typography-text type="secondary" class="!mb-6 block">
        一个 Typora 式的 Markdown 编辑器，所见即所得。
      </a-typography-text>

      <a-space :size="10" class="mb-7">
        <a-button type="primary" size="large" @click="emit('new')">
          <template #icon><FilePlus :size="16" /></template>
          新建文件
        </a-button>
        <a-button size="large" @click="emit('open')">
          <template #icon><FolderOpen :size="16" /></template>
          打开文件
        </a-button>
      </a-space>

      <div v-if="recent.length" class="w-full text-left">
        <div class="text-xs text-fg-soft uppercase tracking-wide mb-2 px-1">最近打开</div>
        <a-list size="small" :data-source="recent">
          <template #renderItem="{ item }">
            <a-list-item
              class="!cursor-pointer !px-2.5"
              :title="item"
              @click="emit('open-recent', item)"
            >
              <div class="flex items-center gap-2">
                <FileText :size="14" class="text-fg-soft shrink-0" />
                <span class="text-sm text-fg-soft truncate">{{ basename(item) }}</span>
              </div>
            </a-list-item>
          </template>
        </a-list>
      </div>
    </div>
  </div>
</template>
