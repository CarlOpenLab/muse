<script setup lang="ts">
import { computed, h, ref } from 'vue'
import type { PromptsItemType } from '@antdv-next/x'
import { Prompts, Sender } from '@antdv-next/x'
import { BrainCircuit, FileCode2, MessageSquareText, Square } from '@lucide/vue'

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
    icon: h(MessageSquareText, { size: 15 }),
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
  <footer class="chat-footer shrink-0 px-4 pb-4 pt-1">
    <Prompts
      v-if="showPrompts"
      class="chat-prompts"
      :items="promptItems"
      title="试试这样问"
      vertical
      @prompt-click="handlePromptClick"
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
        <div class="flex items-center justify-between gap-2 min-h-[34px]">
          <span class="text-[11px] text-fg-soft select-none">
            本地演示模式 · 接入 API 后启用流式输出
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
    <p class="mt-1.5 mb-0 text-center text-[10px] text-fg-soft select-none">
      Muse AI 可能会出错，请核查重要信息。
    </p>
  </footer>
</template>

<style scoped>
.chat-footer :deep(.antd-sender) {
  width: min(100%, 780px);
  margin: 0 auto;
}
.chat-footer :deep(.antd-sender-main) {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  box-shadow: 0 4px 16px rgba(9, 9, 11, 0.06);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.chat-footer :deep(.antd-sender-main:focus-within) {
  border-color: var(--fg-soft);
  box-shadow: 0 0 0 1px var(--fg-soft), 0 4px 16px rgba(9, 9, 11, 0.06);
}
.chat-footer :deep(.antd-sender-content) {
  padding: 10px 12px 2px;
}
.chat-footer :deep(.antd-sender-footer) {
  padding: 0 12px 8px;
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
  width: 32px;
  min-width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--accent);
  color: var(--bg);
}
.chat-prompts {
  width: min(100%, 780px);
  margin: 0 auto 10px;
}
.chat-prompts :deep(.antd-prompts-item) {
  border-color: var(--border);
}
</style>
