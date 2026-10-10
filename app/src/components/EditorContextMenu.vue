<script setup lang="ts">
import { computed } from 'vue'
import type { FormatAction } from '../editor/formatCommands'

/**
 * 编辑器右键菜单（Typora 式）：剪贴板 + 行内格式 + 段落 + 表格操作。
 * 纯展示组件：位置与状态由 App 计算，动作经事件回抛 App 分发。
 */
const props = defineProps<{
  open: boolean
  x: number
  y: number
  inTable: boolean
}>()
const emit = defineEmits<{
  close: []
  format: [action: FormatAction]
  clipboard: [op: 'cut' | 'copy' | 'paste']
  link: []
  image: []
}>()

interface Item {
  label: string
  action?: () => void
  separatorBefore?: boolean
  shortcut?: string
}

const items = computed<Item[]>(() => {
  const list: Item[] = [
    { label: '剪切', action: () => emit('clipboard', 'cut') },
    { label: '复制', action: () => emit('clipboard', 'copy') },
    { label: '粘贴', action: () => emit('clipboard', 'paste') },
    { label: '加粗', separatorBefore: true, shortcut: '⌘B', action: () => emit('format', 'bold') },
    { label: '斜体', shortcut: '⌘I', action: () => emit('format', 'italic') },
    { label: '删除线', shortcut: '⌃⇧`', action: () => emit('format', 'strike') },
    { label: '行内代码', shortcut: '⌘⇧`', action: () => emit('format', 'inline-code') },
    { label: '链接…', shortcut: '⌘K', action: () => emit('link') },
    { label: '图片…', action: () => emit('image') },
    { label: '清除格式', shortcut: '⌘\\', action: () => emit('format', 'clear-format') },
    { label: '一级标题', separatorBefore: true, shortcut: '⌘1', action: () => emit('format', 'heading-1') },
    { label: '二级标题', shortcut: '⌘2', action: () => emit('format', 'heading-2') },
    { label: '三级标题', shortcut: '⌘3', action: () => emit('format', 'heading-3') },
    { label: '正文', shortcut: '⌘0', action: () => emit('format', 'paragraph') },
    { label: '引用', shortcut: '⌘⌥Q', action: () => emit('format', 'quote') },
    { label: '无序列表', shortcut: '⌘⌥U', action: () => emit('format', 'bullet-list') },
    { label: '有序列表', shortcut: '⌘⌥O', action: () => emit('format', 'ordered-list') },
    { label: '任务列表', shortcut: '⌘⇧X', action: () => emit('format', 'task-list') },
    { label: '代码块', shortcut: '⌘⌥C', action: () => emit('format', 'code-fence') },
    { label: '数学块', shortcut: '⌘⌥B', action: () => emit('format', 'math-block') },
    { label: '表格', shortcut: '⌘⌥T', action: () => emit('format', 'table') },
    { label: '分隔线', action: () => emit('format', 'hr') }
  ]
  if (props.inTable) {
    list.push(
      { label: '上方插入行', separatorBefore: true, action: () => emit('format', 'table-row-above') },
      { label: '下方插入行', action: () => emit('format', 'table-row-below') },
      { label: '左侧插入列', action: () => emit('format', 'table-col-left') },
      { label: '右侧插入列', action: () => emit('format', 'table-col-right') },
      { label: '删除行', separatorBefore: true, action: () => emit('format', 'table-delete-row') },
      { label: '删除列', action: () => emit('format', 'table-delete-col') },
      { label: '删除表格', action: () => emit('format', 'table-delete') }
    )
  }
  return list
})

/** 贴边翻转：避免菜单溢出窗口 */
const style = computed(() => {
  const W = 216
  const H = items.value.length * 30 + 12
  const x = props.x + W > window.innerWidth ? props.x - W : props.x
  const y = props.y + H > window.innerHeight ? Math.max(8, props.y - H) : props.y
  return { left: `${x}px`, top: `${y}px` }
})
</script>

<template>
  <Teleport to="body">
    <template v-if="open">
      <div class="fixed inset-0 z-40" @mousedown.prevent="emit('close')" @contextmenu.prevent="emit('close')" />
      <div class="ctx-menu fixed z-50 py-1.5 rounded-lg border border-border-strong bg-bg-elev shadow-lg" :style="style">
        <template v-for="(item, i) in items" :key="i">
          <div v-if="item.separatorBefore" class="my-1 h-px bg-border" />
          <button
            class="ctx-menu-item"
            @click="item.action?.(); emit('close')"
          >
            <span>{{ item.label }}</span>
            <span v-if="item.shortcut" class="text-[11px] text-fg-dim">{{ item.shortcut }}</span>
          </button>
        </template>
      </div>
    </template>
  </Teleport>
</template>
