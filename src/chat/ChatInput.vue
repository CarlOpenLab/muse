<script setup lang="ts">
import { ref } from 'vue'
import { Sender } from '@antdv-next/x'
import { Square } from '@lucide/vue'

const props = defineProps<{
  modelValue: string
  loading: boolean
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

function handleChange(value: string): void {
  emit('update:modelValue', value)
}

function handleSubmit(value: string): void {
  const text = value.trim()
  if (!text) return
  emit('submit', text)
  emit('update:modelValue', '')
}
</script>

<template>
  <footer class="chat-footer shrink-0 px-6 pb-5 pt-2">
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
      <!-- 空 suffix：屏蔽 Sender 默认渲染在输入区右侧的发送按钮，
           仅保留 footer 中的唯一发送按钮（defaultNode） -->
      <template #suffix></template>
      <template #footer="{ defaultNode }">
        <div class="flex items-center justify-end gap-3 min-h-[34px]">
          <a-tooltip v-if="loading" title="停止生成">
            <a-button
              type="primary"
              shape="circle"
              class="sender-stop-btn !w-[34px] !h-[34px] !min-w-0 !rounded-[9px] !bg-accent !text-bg"
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

/* 停止按钮：与发送按钮同尺寸同圆角同品牌色，切换时不跳动 */
.sender-stop-btn {
  box-shadow: 0 2px 6px rgba(9, 9, 11, 0.18);
}
.sender-stop-btn:hover {
  opacity: 0.9;
}
</style>
