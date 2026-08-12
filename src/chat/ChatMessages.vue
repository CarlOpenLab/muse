<script setup lang="ts">
import { computed, h, provide } from 'vue'
import type { BubbleItemType, BubbleListProps } from '@antdv-next/x'
import { BubbleList, Welcome, Actions, ActionsCopy } from '@antdv-next/x'
import type { ItemType as ActionsItemType } from '@antdv-next/x'
import { XMarkdown } from '@antdv-next/x-markdown'
import { RotateCcw, Sparkles, ArrowDownToLine, Replace } from '@lucide/vue'
import MarkdownCodeRenderer from './MarkdownCodeRenderer.vue'
import { isDarkKey } from './theme'
import type { Conversation } from './useChat'

const props = defineProps<{
  conversation?: Conversation
  isRequesting: boolean
  isDark: boolean
  /** 最近一次提问针对过选区（回答可用「替换选中」直接落回文档） */
  canReplaceSelection?: boolean
}>()

const emit = defineEmits<{
  reload: [messageId: string | number]
  /** 把某条 AI 回答的 markdown 插入到正文 */
  insert: [text: string]
  /** 用某条 AI 回答的 markdown 替换选中的原文 */
  replaceSelection: [text: string]
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

/** 消息操作（@antdv-next/x Actions）：复制 / 插入到正文 / 替换选中 / 重新生成 */
function actionItems(item: BubbleItemType): ActionsItemType[] {
  const content = String(item.content)
  const items: ActionsItemType[] = []
  if (item.role !== 'assistant' || item.status !== 'success') return items
  items.push({ key: 'copy', actionRender: h(ActionsCopy, { text: content }) })
  items.push({
    key: 'insert',
    icon: h(ArrowDownToLine, { size: 13 }),
    onItemClick: () => emit('insert', content),
  })
  if (props.canReplaceSelection && item.key === lastAssistantKey.value) {
    items.push({
      key: 'replace',
      icon: h(Replace, { size: 13 }),
      onItemClick: () => emit('replaceSelection', content),
    })
  }
  if (item.key === lastAssistantKey.value && !props.isRequesting) {
    items.push({
      key: 'reload',
      icon: h(RotateCcw, { size: 13 }),
      onItemClick: () => emit('reload', item.key),
    })
  }
  return items
}

const markdownComponents = { code: MarkdownCodeRenderer }

/** XMarkdown 主题类：需带上 x-markdown-light/dark 才能命中主题 CSS */
const markdownClassName = computed(() =>
  props.isDark ? 'chat-markdown x-markdown-dark' : 'chat-markdown x-markdown-light'
)
</script>

<template>
  <main class="chat-messages flex-1 min-h-0 overflow-hidden">
    <!-- 空状态 -->
    <section v-if="showWelcome" class="h-full flex items-center justify-center px-6">
      <Welcome
        class="chat-welcome flex-col items-center text-center"
        variant="borderless"
        title="帮你写文档"
        description="基于当前文档问答：总结、扩写、润色、翻译，满意的回答直接插入正文。"
      >
        <template #icon><Sparkles :size="22" /></template>
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
          :class-name="markdownClassName"
        />
      </template>

      <template #footer="{ item }">
        <Actions
          v-if="item.role === 'assistant' && item.status === 'success'"
          :items="actionItems(item)"
          variant="borderless"
          class="chat-msg-actions"
        />
      </template>
    </BubbleList>
  </main>
</template>

<style scoped>
.chat-messages :deep(.antd-bubble-list) {
  width: min(100%, 760px);
  margin: 0 auto;
  padding: 0 28px;
}
.chat-messages :deep(.antd-bubble-list-scroll-content) {
  padding-block: 28px 12px;
}
.chat-messages :deep(.antd-bubble) {
  max-width: 100%;
  padding-block: 12px;
}
.chat-messages :deep(.antd-bubble-start) {
  padding-inline-end: 48px;
}
.chat-messages :deep(.antd-bubble-end) {
  padding-inline-start: 48px;
}
.chat-messages :deep(.antd-bubble-avatar) {
  min-width: 30px;
}
.chat-messages :deep(.antd-bubble-start .antd-bubble-content) {
  background: transparent;
  color: var(--fg);
}
.chat-messages :deep(.antd-bubble-end .antd-bubble-content) {
  padding: 10px 14px;
  border-radius: 14px 14px 4px 14px;
  background: var(--bg-soft);
  color: var(--fg);
  border: 1px solid var(--border-subtle);
}
.chat-avatar {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(9, 9, 11, 0.06);
}
.chat-avatar-assistant {
  background: var(--bg-elev);
  color: var(--fg);
  border: 1px solid var(--border-strong);
}
.chat-avatar-user {
  background: var(--bg-elev);
  color: var(--fg-soft);
  border: 1px solid var(--border);
}
.chat-user-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13.5px;
  line-height: 1.6;
}

/* 消息底部操作区（@antdv-next/x Actions）：复制 / 插入正文 / 替换选中 / 重新生成 */
.chat-msg-actions {
  margin-top: 6px;
}
.chat-msg-actions :deep(.antd-actions-item) {
  color: var(--fg-soft);
}

/* ===== XMarkdown 排版 ===== */
.chat-markdown {
  width: 100%;
  min-width: 0;
  color: var(--fg);
  font-size: 13.5px;
  line-height: 1.7;
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
  margin: 20px 0 10px;
  font-weight: 650;
  line-height: 1.35;
  letter-spacing: -0.01em;
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
  margin: 4px 0;
}
.chat-markdown :deep(blockquote) {
  margin: 0 0 12px;
  padding: 8px 14px;
  border-left: 3px solid var(--border);
  background: var(--bg-soft);
  border-radius: 0 8px 8px 0;
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
  border-radius: 10px;
  overflow: hidden;
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
  border-radius: 8px;
  overflow: hidden;
}
.chat-markdown :deep(th),
.chat-markdown :deep(td) {
  padding: 7px 12px;
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
  margin: 18px 0;
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
  width: 46px;
  height: 46px;
  margin: 0 auto 16px;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--bg-elev);
  color: var(--fg-soft);
}
.chat-welcome :deep(.antd-welcome-title) {
  margin: 0 0 8px;
  color: var(--fg);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.chat-welcome :deep(.antd-welcome-description) {
  color: var(--fg-soft);
  font-size: 12.5px;
  line-height: 1.7;
}
</style>
