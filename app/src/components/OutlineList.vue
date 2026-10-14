<script setup lang="ts">
/**
 * 左侧栏「大纲」页：按标题层级缩进的列表。
 * - 点击某行跳到对应标题（复用编辑区的 activeHeading 高亮）；
 * - 数据来自 useOutline，与正文右侧导航竖轨是同一份；
 * - 空态给出提示而不是留一片空白。
 */
import type { Heading } from '../composables/useOutline'

defineProps<{
  headings: Heading[]
  /** 当前章节在 headings 中的索引（-1 表示未定位） */
  active: number
}>()

const emit = defineEmits<{ jump: [index: number] }>()
</script>

<template>
  <div class="outline-list">
    <div v-if="!headings.length" class="outline-empty">
      <p>这篇文档还没有标题。</p>
      <p>在正文里写入 <code>#</code> 开头的标题后，这里会列出大纲。</p>
    </div>

    <template v-else>
      <button
        v-for="h in headings"
        :key="h.index"
        type="button"
        class="outline-row"
        :class="{ active: h.index === active }"
        :style="{ paddingLeft: `${10 + (h.level - 1) * 14}px` }"
        :title="h.text"
        @click="emit('jump', h.index)"
      >
        <span class="outline-row-text">{{ h.text }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.outline-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 0;
}

.outline-empty {
  padding: 20px 16px;
  color: var(--fg-dim);
  font-size: 12px;
  line-height: 1.7;
}
.outline-empty p {
  margin: 0 0 6px;
}
.outline-empty code {
  padding: 1px 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--fg) 8%, transparent);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}

.outline-row {
  display: flex;
  align-items: center;
  gap: 5px;
  width: calc(100% - 12px);
  height: 26px;
  margin: 0 6px;
  padding-right: 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--fg);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
}
.outline-row:hover {
  background: color-mix(in srgb, var(--fg) 7%, transparent);
}
.outline-row.active {
  background: color-mix(in srgb, var(--fg) 10%, transparent);
  font-weight: 500;
}

.outline-row-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>