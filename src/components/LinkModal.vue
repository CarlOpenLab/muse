<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { Button } from 'antdv-next'

/**
 * 链接输入弹窗（⌘K / 右键「链接…」）。
 * Electron 不支持 window.prompt，自绘一个轻量弹层；
 * 确认后由 App 走 dispatchFormat('link', href) 应用。
 */
const props = defineProps<{ open: boolean; initialText?: string }>()
const emit = defineEmits<{ close: []; confirm: [href: string] }>()

const href = ref('')

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    href.value = ''
    await nextTick()
    inputRef.value?.focus()
  }
)

const inputRef = ref<HTMLInputElement | null>(null)

function confirm(): void {
  const url = href.value.trim()
  if (!url) return
  emit('confirm', url)
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-start justify-center pt-[18vh] bg-black/30" @mousedown.self="emit('close')">
      <div class="w-[420px] rounded-xl border border-border-strong bg-bg-elev shadow-lg p-4">
        <div class="text-[13px] font-medium text-fg mb-1">插入链接</div>
        <div v-if="initialText" class="text-[12px] text-fg-dim mb-2 truncate">链接文字：{{ initialText }}</div>
        <input
          ref="inputRef"
          v-model="href"
          class="w-full h-8 px-2.5 mb-3 rounded-md border border-border-strong bg-bg text-[13px] text-fg outline-none focus:border-fg-ghost"
          placeholder="https://…"
          spellcheck="false"
          @keydown.enter.prevent="confirm"
          @keydown.esc.prevent="emit('close')"
        />
        <div class="flex justify-end gap-2">
          <Button size="small" @click="emit('close')">取消</Button>
          <Button size="small" type="primary" :disabled="!href.trim()" @click="confirm">确定</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
