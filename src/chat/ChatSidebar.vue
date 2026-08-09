<script setup lang="ts">
import { computed, h } from 'vue'
import type { ConversationItemType, ConversationsProps } from '@antdv-next/x'
import { Conversations } from '@antdv-next/x'
import { Ellipsis, MessageSquareText, Pencil, Pin, Trash2 } from '@lucide/vue'
import type { Conversation } from './useChat'

const props = defineProps<{
  conversations: Conversation[]
  activeKey: string
}>()

const emit = defineEmits<{
  new: []
  activeChange: [key: string]
  rename: [key: string, label: string]
  remove: [key: string]
}>()

const items = computed<ConversationItemType[]>(() =>
  props.conversations.map((c) => ({
    key: c.key,
    label: c.label,
    group: c.group,
    icon: h(MessageSquareText, { size: 15 }),
  }))
)

const menu: ConversationsProps['menu'] = (item) => ({
  trigger: () =>
    h('button', { type: 'button', class: 'conversation-menu-trigger', 'aria-label': '对话操作' }, [
      h(Ellipsis, { size: 15 }),
    ]),
  items: [
    {
      key: 'rename',
      label: '重命名',
      icon: h(Pencil, { size: 14 }),
      onClick: () => {
        const next = window.prompt('对话名称', String(item.label ?? ''))
        if (next?.trim()) emit('rename', String(item.key), next.trim())
      },
    },
    {
      key: 'pin',
      label: item.group === '置顶' ? '取消置顶' : '置顶对话',
      icon: h(Pin, { size: 14 }),
      onClick: () => {
        const conv = props.conversations.find((c) => c.key === item.key)
        if (!conv) return
        conv.group = conv.group === '置顶' ? '今天' : '置顶'
        if (conv.group === '置顶') {
          props.conversations.sort(
            (a, b) => Number(b.group === '置顶') - Number(a.group === '置顶')
          )
        }
      },
    },
    { type: 'divider' },
    {
      key: 'delete',
      label: '删除对话',
      icon: h(Trash2, { size: 14 }),
      danger: true,
      onClick: () => emit('remove', String(item.key)),
    },
  ],
})

function handleActiveChange(key: string): void {
  emit('activeChange', key)
}
</script>

<template>
  <aside class="chat-sidebar w-56 shrink-0 flex flex-col border-r border-border bg-bg-soft">
    <div class="px-2.5 pt-2.5 pb-1">
      <a-button block type="text" class="!justify-start !h-9 !rounded-lg" @click="emit('new')">
        <template #icon><MessageSquareText :size="15" /></template>
        <span class="text-[13px]">新对话</span>
      </a-button>
    </div>
    <div class="flex-1 min-h-0 overflow-y-auto px-1.5 pb-2">
      <Conversations
        :items="items"
        :active-key="props.activeKey"
        :menu="menu"
        :groupable="{ collapsible: true }"
        @active-change="handleActiveChange"
      />
    </div>
  </aside>
</template>

<style scoped>
.chat-sidebar :deep(.antd-conversations) {
  padding: 0;
}
.chat-sidebar :deep(.antd-conversations-item) {
  border-radius: 8px;
}
.chat-sidebar :deep(.antd-conversations-item-label) {
  font-size: 13px;
}
.conversation-menu-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--fg-soft);
  cursor: pointer;
}
.conversation-menu-trigger:hover {
  background: var(--border-subtle);
  color: var(--fg);
}
</style>
