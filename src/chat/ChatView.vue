<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useChat } from './useChat'
import ChatSidebar from './ChatSidebar.vue'
import ChatMessages from './ChatMessages.vue'
import ChatInput from './ChatInput.vue'

const props = defineProps<{ isDark: boolean }>()
const emit = defineEmits<{ manage: [] }>()

const chat = useChat()
const {
  conversationList,
  activeKey,
  activeConversation,
  isRequesting,
  providers,
  activeProviderName,
  activeModelId,
  reasoningAvailable,
  webSearchConfigured,
  searching,
  selectProvider,
  selectModel,
  newConversation,
  activate,
  removeConversation,
  renameConversation,
  send,
  stop,
  reload,
} = chat

// 可写开关：computed 包装解构出的 ref，保证 v-model 写入 .value
const reasoning = computed<boolean>({
  get: () => chat.reasoning.value,
  set: (value: boolean) => {
    chat.reasoning.value = value
  },
})
const webSearch = computed<boolean>({
  get: () => chat.webSearch.value,
  set: (value: boolean) => {
    chat.webSearch.value = value
  },
})

const draft = ref('')

function handleSubmit(value: string): void {
  send(value)
}

// 首次进入 AI Chat：从「新对话」开始（历史会话保留在侧栏），与编辑器首次启动停在欢迎页一致。
// 已有空会话则复用，避免每次启动堆积空的「新对话」。
onMounted(() => {
  const empty = conversationList.value.find((c) => c.messages.length === 0)
  if (empty) activate(empty.key)
  else newConversation()
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
  <div class="chat-view flex h-full min-h-0">
    <ChatSidebar
      :conversations="conversationList"
      :active-key="activeKey"
      @new="newConversation"
      @active-change="activate"
      @rename="renameConversation"
      @remove="removeConversation"
    />

    <div class="flex-1 min-w-0 flex flex-col bg-bg">
      <!-- 顶栏 -->
      <header
        class="shrink-0 h-12 flex items-center justify-between px-5 border-b border-border-subtle select-none"
      >
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="text-[14px] font-semibold truncate tracking-tight">
            {{ activeConversation?.label ?? '新对话' }}
          </span>
        </div>
        <span
          class="shrink-0 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border border-border-subtle text-fg-soft"
        >
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="isRequesting ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500/80'"
          ></span>
          {{ isRequesting ? '生成中' : 'Muse AI 在线' }}
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
        :searching="searching"
        :providers="providers"
        :active-provider="activeProviderName"
        :active-model="activeModelId"
        v-model:reasoning="reasoning"
        :reasoning-available="reasoningAvailable"
        v-model:web-search="webSearch"
        :web-search-configured="webSearchConfigured"
        @update:active-provider="selectProvider"
        @update:active-model="selectModel"
        @submit="handleSubmit"
        @cancel="stop"
        @manage="emit('manage')"
      />
    </div>
  </div>
</template>
