<script setup lang="ts">
import { useInlineMarkState } from '../editor/selectionToolbarState'

/**
 * 选中气泡工具条（由 selectionToolbarPlugin 以独立 Vue app 挂到 body）。
 * 按钮一律 mousedown.prevent：不夺走编辑器焦点，选区才能保住。
 * 动作交给插件 → dispatchFormat / 链接弹窗（App 的 useLinkModal 单例）。
 */
const emit = defineEmits<{ action: [id: string] }>()

const { marks } = useInlineMarkState()

interface Btn {
  id: string
  title: string
  key: 'bold' | 'italic' | 'strike' | 'inlineCode' | 'link'
}

const BUTTONS: Btn[] = [
  { id: 'bold', title: '加粗', key: 'bold' },
  { id: 'italic', title: '斜体', key: 'italic' },
  { id: 'strike', title: '删除线', key: 'strike' },
  { id: 'inline-code', title: '行内代码', key: 'inlineCode' },
  { id: 'link', title: '链接', key: 'link' },
]
</script>

<template>
  <div class="muse-sel-toolbar-inner">
    <button
      v-for="b in BUTTONS"
      :key="b.id"
      type="button"
      class="muse-sel-toolbar-btn"
      :class="{ 'is-active': marks[b.key] }"
      :title="b.title"
      :aria-label="b.title"
      :aria-pressed="marks[b.key]"
      @mousedown.prevent
      @click="emit('action', b.id)"
    >
      <svg v-if="b.id === 'bold'" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M4.5 3h4a2.5 2.5 0 0 1 0 5h-4zM4.5 8h4.5a2.5 2.5 0 0 1 0 5H4.5z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
      </svg>
      <svg v-else-if="b.id === 'italic'" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M7 3h5M4 13h5M9.5 3 6.5 13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <svg v-else-if="b.id === 'strike'" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M10.6 4.6c-.5-.9-1.5-1.4-2.7-1.4-1.6 0-2.8.9-2.8 2.2 0 .6.3 1.1.8 1.5M5.6 11.2c.6.9 1.6 1.4 2.9 1.4 1.7 0 2.9-.9 2.9-2.2 0-.5-.2-1-.6-1.4M3 8h10"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      </svg>
      <svg v-else-if="b.id === 'inline-code'" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M6 4 2.5 8 6 12M10 4l3.5 4L10 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <svg v-else width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M6.5 9.5a2.9 2.9 0 0 0 4.1 0l2-2a2.9 2.9 0 0 0-4.1-4.1l-1 1M9.5 6.5a2.9 2.9 0 0 0-4.1 0l-2 2a2.9 2.9 0 0 0 4.1 4.1l1-1"
          fill="none"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      </svg>
    </button>
  </div>
</template>
