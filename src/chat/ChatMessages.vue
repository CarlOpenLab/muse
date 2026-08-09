<script setup lang="ts">
import { computed, provide } from 'vue'
import type { BubbleItemType, BubbleListProps } from '@antdv-next/x'
import { BubbleList, Welcome } from '@antdv-next/x'
import { XMarkdown } from '@antdv-next/x-markdown'
import { RotateCcw, Sparkles } from '@lucide/vue'
import MarkdownCodeRenderer from './MarkdownCodeRenderer.vue'
import { isDarkKey } from './theme'
import type { Conversation } from './useChat'

const props = defineProps<{
  conversation?: Conversation
  isRequesting: boolean
  isDark: boolean
}>()

const emit = defineEmits<{
  reload: [messageId: string | number]
}>()

provide(isDarkKey, computed(() => props.isDark))

const showWelcome = computed(() => !props.conversation || props.conversation.messages.length === 0)

/** "updating" = 流式接收中，"loading" = 占位等待 */
const isStreaming = (status?: string): boolean => status === 'updating' || status === 'loading'

const bubbleItems = computed<BubbleItemType[]>(() =>
  (props.conversation?.messages ?? []).map(({ id, message, status }, index) => ({
    key: id ?? `m-${index}`,
    role: message.role as BubbleItemType['role'],
    status,
    loading: status === 'loading',
    content: typeof message.content === 'string' ? message.content : '',
  }))
)

const roleConfig: BubbleListProps['role'] = {
  assistant: { placement: 'start' },
  user: { placement: 'end' },
}

const lastAssistantKey = computed(
  () => [...bubbleItems.value].reverse().find((i) => i.role === 'assistant')?.key
)

const markdownComponents = { code: MarkdownCodeRenderer }
</script>

<template>
  <main class="chat-messages flex-1 min-h-0 overflow-hidden">
    <!-- 空状态 -->
    <section v-if="showWelcome" class="h-full flex items-center justify-center">
      <Welcome
        class="chat-welcome"
        variant="borderless"
        title="今天想一起完成什么？"
        description="和 Muse AI 聊聊：总结文档、写代码、整理思路，灵感逐字涌现。"
      >
        <template #icon><Sparkles :size="20" /></template>
        <template #extra>
          <div class="chat-welcome-tips">
            <span>💡 试试「写一段 Vue 代码」</span>
            <span>🧠 试试「介绍一下 Muse 架构」</span>
          </div>
        </template>
      </Welcome>
    </section>

    <!-- 消息流 -->
    <BubbleList
      v-else
      class="h-full"
      :items="bubbleItems"
      :role="roleConfig"
      auto-scroll
    >
      <template #avatar="{ role }">
        <span
          class="chat-avatar"
          :class="role === 'assistant' ? 'chat-avatar-assistant' : 'chat-avatar-user'"
          :title="role === 'assistant' ? 'Muse AI' : '我'"
        >
          <Sparkles v-if="role === 'assistant'" :size="14" />
          <span v-else class="text-[10px] font-bold">我</span>
        </span>
      </template>

      <template #contentRender="{ content, item }">
        <!-- 用户消息：纯文本 -->
        <span v-if="item.role === 'user'" class="chat-user-text">{{ content }}</span>
        <!-- AI 消息：XMarkdown 渲染（流式） -->
        <XMarkdown
          v-else
          :content="String(content)"
          :components="markdownComponents"
          :streaming="
            item.key === lastAssistantKey
              ? { hasNextChunk: isStreaming(item.status), enableAnimation: false }
              : undefined
          "
          class-name="chat-markdown"
        />
      </template>

      <template #footer="{ item }">
        <a-tooltip
          v-if="
            item.role === 'assistant' &&
            item.status === 'success' &&
            item.key === lastAssistantKey &&
            !isRequesting
          "
          title="重新生成"
        >
          <a-button
            type="text"
            size="small"
            class="!w-7 !h-7 !min-w-0 !rounded-md !px-0 text-fg-soft"
            aria-label="重新生成回答"
            @click="emit('reload', item.key)"
          >
            <template #icon><RotateCcw :size="13" /></template>
          </a-button>
        </a-tooltip>
      </template>
    </BubbleList>
  </main>
</template>

<style scoped>
.chat-messages :deep(.antd-bubble-list) {
  width: min(100%, 780px);
  margin: 0 auto;
  padding: 0 24px;
}
.chat-messages :deep(.antd-bubble-list-scroll-content) {
  padding-block: 20px;
}
.chat-messages :deep(.antd-bubble) {
  max-width: 100%;
  padding-block: 12px;
}
.chat-messages :deep(.antd-bubble-start .antd-bubble-content) {
  background: transparent;
  color: var(--fg);
}
.chat-messages :deep(.antd-bubble-end .antd-bubble-content) {
  padding: 10px 14px;
  border-radius: 12px 12px 4px;
  background: var(--bg-soft);
  color: var(--fg);
  border: 1px solid var(--border-subtle);
}
.chat-avatar {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--border);
  flex-shrink: 0;
}
.chat-avatar-assistant {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
}
.chat-avatar-user {
  background: var(--bg-soft);
  color: var(--fg-soft);
}
.chat-user-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13.5px;
  line-height: 1.65;
}

/* ===== XMarkdown 排版 ===== */
.chat-markdown {
  width: 100%;
  min-width: 0;
  color: var(--fg);
  font-size: 13.5px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.chat-markdown :deep(p) {
  margin: 0 0 12px;
}
.chat-markdown :deep(p:last-child) {
  margin-bottom: 0;
}
.chat-markdown :deep(h1),
.chat-markdown :deep(h2),
.chat-markdown :deep(h3),
.chat-markdown :deep(h4) {
  margin: 18px 0 10px;
  font-weight: 650;
  line-height: 1.35;
}
.chat-markdown :deep(h1) {
  font-size: 20px;
}
.chat-markdown :deep(h2) {
  font-size: 17px;
}
.chat-markdown :deep(h3) {
  font-size: 15px;
}
.chat-markdown :deep(ul),
.chat-markdown :deep(ol) {
  margin: 0 0 12px;
  padding-left: 22px;
}
.chat-markdown :deep(li) {
  margin: 3px 0;
}
.chat-markdown :deep(blockquote) {
  margin: 0 0 12px;
  padding: 6px 12px;
  border-left: 3px solid var(--border);
  background: var(--bg-soft);
  border-radius: 0 6px 6px 0;
  color: var(--fg-soft);
}
.chat-markdown :deep(code) {
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--code-inline-bg);
  font-size: 0.92em;
}
.chat-markdown :deep(pre) {
  margin: 0 0 12px;
}
.chat-markdown :deep(pre code) {
  padding: 0;
  background: none;
}
.chat-markdown :deep(table) {
  width: 100%;
  margin: 0 0 12px;
  border-collapse: collapse;
  font-size: 13px;
}
.chat-markdown :deep(th),
.chat-markdown :deep(td) {
  padding: 6px 10px;
  border: 1px solid var(--border);
  text-align: left;
}
.chat-markdown :deep(th) {
  background: var(--bg-soft);
  font-weight: 600;
}
.chat-markdown :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.chat-markdown :deep(hr) {
  margin: 16px 0;
  border: 0;
  border-top: 1px solid var(--border);
}

/* ===== Welcome ===== */
.chat-welcome :deep(.antd-welcome-content-wrapper) {
  align-items: center;
}
.chat-welcome :deep(.antd-welcome-icon) {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: 0 auto 12px;
  border-radius: 10px;
  background: var(--accent);
  color: var(--bg);
}
.chat-welcome :deep(.antd-welcome-title) {
  margin: 0 0 6px;
  color: var(--fg);
  font-size: 22px;
  font-weight: 680;
}
.chat-welcome :deep(.antd-welcome-description) {
  color: var(--fg-soft);
  font-size: 13px;
}
.chat-welcome-tips {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 14px;
  color: var(--fg-soft);
  font-size: 12px;
}
</style>
