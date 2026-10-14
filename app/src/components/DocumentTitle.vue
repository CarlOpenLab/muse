<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

const title = defineModel<string>({ required: true })
const emit = defineEmits<{
  enter: [event: KeyboardEvent]
  /** 这一次标题编辑结束（回车或失焦）——调用方据此把文件名同步成标题 */
  commit: []
}>()
const area = ref<HTMLTextAreaElement | null>(null)
let observer: ResizeObserver | undefined
let lastWidth = 0
let frame = 0
/**
 * 输入法组合（拼音等）进行中。
 *
 * 组合期间必须同时守住两件事：
 * 1. 不把 value 写回 DOM——重写 textarea.value 会打断输入法的组合串，
 *    表现就是拼音和候选字混在一起连续往外冒，还伴随明显卡顿；
 * 2. 不更新 v-model——否则父级会立刻拿半成品标题去改正文并重绘，
 *    而重绘又可能把旧的 title 值推回 DOM，同样会毁掉组合。
 * 于是组合期间只让输入法自己维护文本，等 compositionend 再统一归一化。
 */
let composing = false

function resize(): void {
  if (!area.value) return
  area.value.style.height = '0px'
  area.value.style.height = `${area.value.scrollHeight}px`
}

/** 标题始终是一行 Markdown 标题：粘贴进来的换行折叠成空格，只在组合结束后做。 */
function normalize(element: HTMLTextAreaElement): void {
  const next = element.value.replace(/[\r\n]+/g, ' ')
  if (element.value !== next) element.value = next
  title.value = next
}

function onInput(event: Event): void {
  // 组合期间的 input 交给 compositionend 处理，这里不碰 DOM 也不碰模型
  if (composing || (event as InputEvent).isComposing) return
  normalize(event.target as HTMLTextAreaElement)
  resize()
}

function onCompositionStart(): void {
  composing = true
}

function onCompositionEnd(event: CompositionEvent): void {
  composing = false
  normalize(event.target as HTMLTextAreaElement)
  resize()
}

function onEnter(event: KeyboardEvent): void {
  // 输入法组合中的回车只用于候选上屏，不算「标题写完」
  if (composing || event.isComposing) return
  emit('enter', event)
  emit('commit')
}

function onBlur(event: FocusEvent): void {
  // 失焦时补一次同步：组合可能还没走完 compositionend
  composing = false
  normalize(event.target as HTMLTextAreaElement)
  emit('commit')
}

// 标题只在外部变化时回填 DOM（换文档、源代码模式改过首行等）。
// 不用 :value 绑定是为了避开重绘期间回写 value 打断输入法组合的问题。
watch(title, (next) => {
  if (composing) return
  if (area.value && area.value.value !== next) area.value.value = next
  resize()
})

onMounted(() => {
  if (area.value) area.value.value = title.value
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
    class="title-input"
    placeholder="无标题"
    aria-label="文档标题"
    rows="1"
    spellcheck="false"
    @input="onInput"
    @compositionstart="onCompositionStart"
    @compositionend="onCompositionEnd"
    @keydown.enter="onEnter"
    @blur="onBlur"
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