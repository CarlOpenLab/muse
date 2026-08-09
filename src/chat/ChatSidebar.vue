<script setup lang="ts">
import { computed, h } from 'vue'
import type { ConversationItemType, ConversationsProps } from '@antdv-next/x'
import { Conversations } from '@antdv-next/x'
import { Ellipsis, MessageSquareText, Pencil, Pin, Sparkles, Trash2 } from '@lucide/vue'
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
  <aside class="chat-sidebar w-[236px] shrink-0 flex flex-col bg-bg border-r border-border">
    <!-- 品牌区 + 新对话 -->
    <div class="px-3 pt-3.5 pb-2.5 space-y-3">
      <div class="flex items-center gap-2 px-1">
        <span class="grid place-items-center w-6 h-6 rounded-md bg-accent text-bg">
          <Sparkles :size="13" />
        </span>
        <span class="text-[13px] font-semibold tracking-wide select-none">Muse AI</span>
      </div>
      <button type="button" class="new-chat-btn" @click="emit('new')">
        <MessageSquareText :size="15" />
        <span>新对话</span>
      </button>
    </div>

    <!-- 会话列表 -->
    <div class="flex-1 min-h-0 overflow-y-auto px-2 pb-2 chat-list">
      <Conversations
        :items="items"
        :active-key="props.activeKey"
        :menu="menu"
        :on-active-change="handleActiveChange"
        @update:active-key="handleActiveChange"
        :groupable="{ collapsible: true }"
      />
    </div>

    <!-- 底部状态 -->
    <div
      class="shrink-0 px-4 py-2.5 border-t border-border-subtle flex items-center gap-1.5 text-[11px] text-fg-soft select-none"
    >
      <span class="w-1.5 h-1.5 rounded-full bg-emerald-500/80"></span>
      本地演示模式
    </div>
  </aside>
</template>

<style scoped>
.new-chat-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 36px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--fg);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 160ms ease;
}
.new-chat-btn:hover {
  background: var(--fg);
  border-color: var(--fg);
  color: var(--bg);
}
.new-chat-btn:active {
  transform: scale(0.98);
}

/* Conversations：让 item 更紧凑精致，选中态黑底白字（shadcn 风格） */
.chat-sidebar :deep(.antd-conversations) {
  padding: 0;
}
.chat-sidebar :deep(.antd-conversations-item) {
  height: 34px;
  border-radius: 8px;
  padding-inline: 8px;
  margin-block: 1px;
  transition: background 120ms ease;
}
.chat-sidebar :deep(.antd-conversations-item:hover) {
  background: var(--bg-soft);
}
.chat-sidebar :deep(.antd-conversations-item-active),
.chat-sidebar :deep(.antd-conversations-item-active:hover) {
  background: var(--fg);
}
.chat-sidebar :deep(.antd-conversations-item-active .antd-conversations-item-label),
.chat-sidebar :deep(.antd-conversations-item-active .antd-conversations-item-icon) {
  color: var(--bg);
}
.chat-sidebar :deep(.antd-conversations-item-label) {
  font-size: 13px;
  color: var(--fg);
}
.chat-sidebar :deep(.antd-conversations-item-icon) {
  color: var(--fg-soft);
}
.chat-sidebar :deep(.antd-conversations-group-label) {
  font-size: 11px;
  color: var(--fg-soft);
  font-weight: 500;
  padding: 10px 8px 4px;
}
.conversation-menu-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
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
