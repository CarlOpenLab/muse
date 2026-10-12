<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

const title = defineModel<string>({ required: true })
const emit = defineEmits<{ enter: [event: KeyboardEvent] }>()
const area = ref<HTMLTextAreaElement | null>(null)
let observer: ResizeObserver | undefined
let lastWidth = 0
let frame = 0

function resize(): void {
  if (!area.value) return
  area.value.style.height = '0px'
  area.value.style.height = `${area.value.scrollHeight}px`
}

function onInput(event: Event): void {
  const element = event.target as HTMLTextAreaElement
  // The title stays one Markdown heading even when pasted text contains newlines.
  title.value = element.value.replace(/[\r\n]+/g, ' ')
  element.value = title.value
  resize()
}

watch(title, resize, { flush: 'post' })
onMounted(() => {
  resize()
  observer = new ResizeObserver(([entry]) => {
    if (entry && entry.contentRect.width !== lastWidth) {
      lastWidth = entry.contentRect.width
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(resize)
    }
  })
  if (area.value) observer.observe(area.value)
})
onUnmounted(() => {
  observer?.disconnect()
  cancelAnimationFrame(frame)
})
defineExpose({ focus: () => area.value?.focus(), select: () => area.value?.select() })
</script>

<template>
  <textarea
    ref="area"
    :value="title"
    class="title-input"
    placeholder="无标题"
    aria-label="文档标题"
    rows="1"
    spellcheck="false"
    @input="onInput"
    @keydown.enter="emit('enter', $event)"
  />
</template>

<style scoped>
.title-input {
  display: block;
  width: 100%;
  min-height: 38px;
  margin-bottom: 16px;
  padding: 0;
  resize: none;
  overflow: hidden;
  border: none;
  outline: none;
  background: transparent;
  color: var(--fg);
  font: 700 30px/1.3 var(--font);
  overflow-wrap: anywhere;
}
.title-input::placeholder {
  color: var(--fg-soft);
  opacity: 0.6;
}
</style>
