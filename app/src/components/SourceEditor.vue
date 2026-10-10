<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

/**
 * 源代码模式（Typora ⌘/）：整页等宽编辑 markdown 原文。
 * 进入时由 App 注入当前正文 markdown；输入防抖回传，退出前强制回传一次。
 */
const props = defineProps<{ content: string }>()
const emit = defineEmits<{
  /** 内容变化（防抖 400ms） */
  change: [text: string]
  /** Esc / 明确退出 */
  exit: []
}>()

const text = ref(props.content)
// 防止父级内容回流打断正在输入的光标
let editing = false

watch(
  () => props.content,
  (v) => {
    if (editing) return
    text.value = v
  }
)

let timer: ReturnType<typeof setTimeout> | undefined
function onInput(): void {
  editing = true
  clearTimeout(timer)
  timer = setTimeout(() => {
    editing = false
    emit('change', text.value)
  }, 400)
}

const areaRef = ref<HTMLTextAreaElement | null>(null)
onMounted(() => areaRef.value?.focus())

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('exit')
  } else if ((e.metaKey || e.ctrlKey) && e.key === '/') {
    e.preventDefault()
    emit('exit')
  }
}

onUnmounted(() => {
  clearTimeout(timer)
  // 卸载前把最后一次输入落回
  if (editing) emit('change', text.value)
})
</script>

<template>
  <textarea
    ref="areaRef"
    v-model="text"
    class="source-editor"
    spellcheck="false"
    @input="onInput"
    @keydown="onKeydown"
  />
</template>

<style scoped>
.source-editor {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 32px 48px 96px;
  resize: none;
  border: none;
  outline: none;
  background: var(--bg);
  color: var(--fg);
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 14px;
  line-height: 1.7;
}
</style>
