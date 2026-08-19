<script setup lang="ts">
import { FilePlus, FolderOpen, FileText, FileUp } from '@lucide/vue'
import logoUrl from '../../resources/icon.png'

defineProps<{ recent: string[] }>()
const emit = defineEmits<{
  new: []
  open: []
  'open-folder': []
  'open-recent': [path: string]
}>()

// 渲染进程无 node:path，自备 basename
function basename(p: string): string {
  return p.split(/[\\/]/).pop() || p
}
</script>

<template>
  <div class="flex-1 flex overflow-auto p-6">
    <div class="m-auto flex flex-col items-center text-center max-w-[360px] w-full">
      <img
        :src="logoUrl"
        alt="Muse"
        class="w-16 h-16 mb-5 rounded-2xl select-none shadow-sm"
        draggable="false"
      />
      <a-typography-title :level="4" class="!mb-1 !font-medium">Muse</a-typography-title>
      <a-typography-text type="secondary" class="!mb-6 block !text-[12.5px]">
        打开一个文件夹作为工作区，或直接新建 / 打开一篇文档。
      </a-typography-text>

      <a-space :size="10" class="mb-3">
        <a-button type="primary" size="large" @click="emit('open-folder')">
          <template #icon><FolderOpen :size="16" /></template>
          打开文件夹
        </a-button>
        <a-button size="large" @click="emit('new')">
          <template #icon><FilePlus :size="16" /></template>
          新建文件
        </a-button>
      </a-space>

      <a-button type="link" size="small" class="!text-fg-soft mb-6" @click="emit('open')">
        <template #icon><FileUp :size="13" /></template>
        打开单个文件
      </a-button>

      <div v-if="recent.length" class="w-full text-left">
        <div class="text-xs text-fg-soft uppercase tracking-wide mb-2 px-1">最近打开</div>
        <div class="overflow-hidden rounded-lg border border-border-subtle">
          <div
            v-for="(item, index) in recent"
            :key="item"
            class="flex items-center gap-2 px-2.5 py-2 cursor-pointer transition-colors hover:bg-bg-soft"
            :class="{ 'border-t border-border-subtle': index > 0 }"
            :title="item"
            @click="emit('open-recent', item)"
          >
            <FileText :size="14" class="text-fg-soft shrink-0" />
            <span class="text-sm text-fg-soft truncate">{{ basename(item) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
