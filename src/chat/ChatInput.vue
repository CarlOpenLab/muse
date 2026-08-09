<script setup lang="ts">
import { computed, h, ref } from 'vue'
import type { PromptsItemType } from '@antdv-next/x'
import { Prompts, Sender } from '@antdv-next/x'
import { BrainCircuit, FileCode2, Square, Sparkles } from '@lucide/vue'

const props = defineProps<{
  modelValue: string
  loading: boolean
  showPrompts: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: [value: string]
  cancel: []
}>()

// Sender 组件实例 ref：暴露 focus() 供外部聚焦输入框
const senderEl = ref<{ nativeElement: HTMLElement } | null>(null)
function focus(): void {
  senderEl.value?.nativeElement?.querySelector('textarea')?.focus()
}
defineExpose({ focus })

const promptItems: PromptsItemType[] = [
  {
    key: 'hello',
    icon: h(Sparkles, { size: 15 }),
    label: '打个招呼',
    description: '你好，Muse AI！',
  },
  {
    key: 'code',
    icon: h(FileCode2, { size: 15 }),
    label: '写代码',
    description: '写一段 Vue 3 + TypeScript 的示例代码',
  },
  {
    key: 'arch',
    icon: h(BrainCircuit, { size: 15 }),
    label: '聊架构',
    description: '介绍一下 Muse 的技术架构',
  },
]

function handleChange(value: string): void {
  emit('update:modelValue', value)
}

function handleSubmit(value: string): void {
  const text = value.trim()
  if (!text) return
  emit('submit', text)
  emit('update:modelValue', '')
}

function handlePromptClick(info: { data: { description?: unknown } }): void {
  const prompt = typeof info.data.description === 'string' ? info.data.description : ''
  if (prompt && !props.loading) emit('submit', prompt)
}

const showPrompts = computed(() => props.showPrompts && !props.loading)
</script>

<template>
  <footer class="chat-footer shrink-0 px-6 pb-5 pt-2">
    <Prompts
      v-if="showPrompts"
      class="chat-prompts"
      :items="promptItems"
      title="试试这样问"
      :wrap="true"
      @item-click="handlePromptClick"
    />

    <Sender
      ref="senderEl"
      :value="modelValue"
      :loading="loading"
      :auto-size="{ minRows: 1, maxRows: 6 }"
      placeholder="和 Muse AI 聊聊…（Enter 发送，Shift+Enter 换行）"
      :on-change="handleChange"
      :on-submit="handleSubmit"
      :on-cancel="() => emit('cancel')"
    >
      <template #footer="{ defaultNode }">
        <div class="flex items-center justify-between gap-3 min-h-[34px]">
          <span class="text-[11px] text-fg-soft select-none">
            Muse AI 可能会出错，请核查重要信息。
          </span>
          <a-tooltip v-if="loading" title="停止生成">
            <a-button
              type="primary"
              shape="circle"
              class="!w-8 !h-8 !min-w-0"
              aria-label="停止生成"
              @click="emit('cancel')"
            >
              <template #icon><Square :size="13" class="fill-current" /></template>
            </a-button>
          </a-tooltip>
          <component :is="defaultNode" v-else />
        </div>
      </template>
    </Sender>
  </footer>
</template>

<style scoped>
.chat-footer :deep(.antd-sender) {
  width: min(100%, 760px);
  margin: 0 auto;
}
.chat-footer :deep(.antd-sender-main) {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg);
  box-shadow: 0 2px 12px rgba(9, 9, 11, 0.05);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.chat-footer :deep(.antd-sender-main:focus-within) {
  border-color: var(--fg-soft);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--fg-soft) 14%, transparent),
    0 4px 20px rgba(9, 9, 11, 0.07);
}
.chat-footer :deep(.antd-sender-content) {
  padding: 12px 14px 2px;
}
.chat-footer :deep(.antd-sender-footer) {
  padding: 0 12px 10px;
}
.chat-footer :deep(textarea) {
  color: var(--fg);
  caret-color: var(--accent);
  font-size: 13.5px;
  line-height: 1.65;
}
.chat-footer :deep(textarea::placeholder) {
  color: var(--fg-soft);
  opacity: 0.75;
}
.chat-footer :deep(.antd-sender-actions-btn) {
  width: 34px;
  min-width: 34px;
  height: 34px;
  border-radius: 9px;
  background: var(--accent);
  color: var(--bg);
  box-shadow: 0 2px 6px rgba(9, 9, 11, 0.18);
}
.chat-footer :deep(.antd-sender-actions-btn:disabled) {
  opacity: 0.35;
  box-shadow: none;
}
.chat-footer :deep(.antd-sender-actions-btn:hover:not(:disabled)) {
  opacity: 0.9;
}

/* Prompts：横向卡片网格 */
.chat-prompts {
  width: min(100%, 760px);
  margin: 0 auto 12px;
}
.chat-prompts :deep(.antd-prompts-list) {
  grid-template-columns: repeat(3, 1fr);
}
.chat-prompts :deep(.antd-prompts-item) {
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg);
  transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
}
.chat-prompts :deep(.antd-prompts-item:hover) {
  border-color: var(--fg-soft);
  box-shadow: 0 4px 14px rgba(9, 9, 11, 0.07);
  transform: translateY(-1px);
}
.chat-prompts :deep(.antd-prompts-title) {
  font-size: 12px;
  color: var(--fg-soft);
  margin-bottom: 8px;
}
.chat-prompts :deep(.antd-prompts-item-label) {
  color: var(--fg);
  font-size: 13px;
  font-weight: 600;
}
.chat-prompts :deep(.antd-prompts-item-description) {
  color: var(--fg-soft);
  font-size: 12px;
}
</style>
