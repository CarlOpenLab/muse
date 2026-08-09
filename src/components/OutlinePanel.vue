<script setup lang="ts">
import { computed } from 'vue'
import type { Heading as HeadingT } from '../composables/useOutline'

interface TreeNode {
  title: string
  key: number
  children?: TreeNode[]
}

const props = defineProps<{ headings: HeadingT[] }>()
const emit = defineEmits<{ jump: [index: number] }>()

// 扁平标题列表（带 level） -> 嵌套树，供 a-tree 渲染
const treeData = computed<TreeNode[]>(() => {
  const root: TreeNode[] = []
  const stack: { node: TreeNode; level: number }[] = []
  for (const h of props.headings) {
    const node: TreeNode = { title: h.text, key: h.index }
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop()
    if (stack.length) {
      ;(stack[stack.length - 1].node.children ??= []).push(node)
    } else {
      root.push(node)
    }
    stack.push({ node, level: h.level })
  }
  return root
})

function onSelect(keys: (string | number)[]): void {
  if (keys.length) emit('jump', Number(keys[0]))
}
</script>

<template>
  <aside class="w-56 shrink-0 bg-page-bg border-l border-border-subtle overflow-y-auto flex flex-col">
    <div
      class="flex items-center px-4 pt-3 pb-2 text-xs text-fg-soft uppercase tracking-wide select-none"
    >
      <span>大纲</span>
    </div>
    <a-tree
      v-if="headings.length"
      :tree-data="treeData"
      :default-expand-all="true"
      block-node
      class="!px-1 !text-sm"
      @select="onSelect"
    />
    <div v-else class="flex-1 flex items-center justify-center px-4">
      <a-empty>
        <template #description>
          <div class="text-xs text-fg-soft">
            <div>暂无大纲</div>
            <div class="text-[11px] opacity-60 mt-1">打开或新建文档后，标题会显示在这里</div>
          </div>
        </template>
      </a-empty>
    </div>
  </aside>
</template>
