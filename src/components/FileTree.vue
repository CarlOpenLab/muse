<script setup lang="ts">
/**
 * 递归文件树节点列表。
 * 组件自引用渲染子层级（<script setup> 里用文件名即可自引用）。
 * 只负责渲染与交互，所有写操作转成事件交给 FileSidebar 统一处理。
 */
import { nextTick } from 'vue'
import { ChevronRight, FileText } from '@lucide/vue'
import type { TreeNode } from '../composables/useWorkspace'

defineProps<{
  nodes: TreeNode[]
  depth: number
  /** 当前打开的文件路径（高亮用） */
  current: string | null
  /** 正在行内重命名的节点路径 */
  renaming: string | null
  isExpanded: (path: string) => boolean
}>()

const emit = defineEmits<{
  open: [node: TreeNode]
  toggle: [node: TreeNode]
  menu: [payload: { node: TreeNode; x: number; y: number }]
  rename: [payload: { node: TreeNode; name: string }]
  'cancel-rename': []
}>()

/** 进入重命名态时聚焦并选中「文件名」部分（不含扩展名） */
function onInputMounted(el: Element | null, node: TreeNode): void {
  if (!(el instanceof HTMLInputElement)) return
  void nextTick(() => {
    el.focus()
    const dot = node.name.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : node.name.length)
  })
}

// 回车提交后输入框会失焦，blur 会再触发一次；用 settled 标记保证只落一次
function submitRename(node: TreeNode, e: Event): void {
  const el = e.target as HTMLInputElement
  if (el.dataset.settled) return
  el.dataset.settled = '1'
  emit('rename', { node, name: el.value })
}

function cancelRename(e: Event): void {
  ;(e.target as HTMLInputElement).dataset.settled = '1'
  emit('cancel-rename')
}

// 层级缩进：每级 12px，起点留出箭头位
function indent(depth: number): string {
  return `${8 + depth * 12}px`
}
</script>

<template>
  <div
    v-for="node in nodes"
    :key="node.path"
    class="select-none"
  >
    <!-- 行内重命名：输入框顶替整行 -->
    <input
      v-if="renaming === node.path"
      :ref="(el) => onInputMounted(el as Element | null, node)"
      class="file-rename-input"
      :style="{ paddingLeft: indent(depth) }"
      :value="node.name"
      @keydown.enter.prevent="submitRename(node, $event)"
      @keydown.esc.prevent="cancelRename($event)"
      @blur="submitRename(node, $event)"
    />

    <!-- 目录 -->
    <button
      v-else-if="node.type === 'dir'"
      type="button"
      class="file-item"
      :style="{ paddingLeft: indent(depth) }"
      :title="node.name"
      @click="emit('toggle', node)"
      @contextmenu.prevent="emit('menu', { node, x: $event.clientX, y: $event.clientY })"
    >
      <ChevronRight
        :size="13"
        class="file-chevron shrink-0"
        :class="{ open: isExpanded(node.path) }"
      />
      <span class="truncate">{{ node.name }}</span>
    </button>

    <!-- 文件 -->
    <button
      v-else
      type="button"
      class="file-item"
      :class="{ active: current === node.path }"
      :style="{ paddingLeft: indent(depth) }"
      :title="node.name"
      @click="emit('open', node)"
      @contextmenu.prevent="emit('menu', { node, x: $event.clientX, y: $event.clientY })"
    >
      <FileText :size="13" class="shrink-0 opacity-55" />
      <span class="truncate">{{ node.name.replace(/\.(md|markdown|mdx)$/i, '') }}</span>
    </button>

    <!-- 子层级 -->
    <FileTree
      v-if="node.type === 'dir' && node.children?.length && isExpanded(node.path)"
      :nodes="node.children"
      :depth="depth + 1"
      :current="current"
      :renaming="renaming"
      :is-expanded="isExpanded"
      @open="emit('open', $event)"
      @toggle="emit('toggle', $event)"
      @menu="emit('menu', $event)"
      @rename="emit('rename', $event)"
      @cancel-rename="emit('cancel-rename')"
    />
  </div>
</template>
