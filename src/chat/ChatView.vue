<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useChat } from './useChat'
import ChatSidebar from './ChatSidebar.vue'
import ChatMessages from './ChatMessages.vue'
import ChatInput from './ChatInput.vue'

const props = defineProps<{ isDark: boolean }>()

const {
  conversationList,
  activeKey,
  activeConversation,
  showWelcome,
  isRequesting,
  newConversation,
  activate,
  removeConversation,
  renameConversation,
  send,
  stop,
  reload,
} = useChat()

const draft = ref('')

function handleSubmit(value: string): void {
  send(value)
}

// 首次进入且没有任何会话时，自动新建一个空会话（进入 welcome 态）
onMounted(() => {
  if (!activeKey.value && conversationList.value.length === 0) {
    newConversation()
  }
})

// 切换会话时清空输入草稿
watch(activeKey, () => {
  draft.value = ''
})

// 切换会话后输入框自动聚焦
const senderRef = ref<{ focus: () => void } | null>(null)
watch(activeKey, () => {
  requestAnimationFrame(() => {
    senderRef.value?.focus()
  })
})
</script>

<template>
  <div
    class="relative rounded-xl border border-border bg-bg overflow-hidden flex-1 flex min-h-0"
  >
    <ChatSidebar
      :conversations="conversationList"
      :active-key="activeKey"
      @new="newConversation"
      @active-change="activate"
      @rename="renameConversation"
      @remove="removeConversation"
    />

    <div class="flex-1 min-w-0 flex flex-col bg-page-bg">
      <!-- 顶栏 -->
      <header
        class="h-11 shrink-0 flex items-center justify-between px-4 border-b border-border-subtle bg-bg"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-[13px] font-semibold truncate">
            {{ activeConversation?.label ?? '新对话' }}
          </span>
        </div>
        <span
          class="shrink-0 text-[11px] px-2 py-0.5 rounded-full border border-border-subtle text-fg-soft select-none"
        >
          {{ isRequesting ? '生成中…' : 'Muse AI' }}
        </span>
      </header>

      <ChatMessages
        :conversation="activeConversation"
        :is-requesting="isRequesting"
        :is-dark="props.isDark"
        @reload="reload"
      />

      <ChatInput
        ref="senderRef"
        v-model="draft"
        :loading="isRequesting"
        :show-prompts="showWelcome"
        @submit="handleSubmit"
        @cancel="stop"
      />
    </div>
  </div>
</template>
