<script setup lang="ts">
import { watch } from 'vue'
import { useEditor, Milkdown } from '@milkdown/vue'
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { nord } from '@milkdown/theme-nord'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'
import { trailing } from '@milkdown/plugin-trailing'
import { replaceAll, callCommand } from '@milkdown/utils'
import '@milkdown/theme-nord/style.css'
import { shikiCodeBlock } from './shiki/shikiCodeBlock'
import { codeBlockView } from './codeBlockView'
import { codeBlockTabKeymap } from './codeBlockKeymap'
import { searchPlugin } from './searchPlugin'
import { searchCommand } from './searchCommands'
import { useSearch } from '../composables/useSearch'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

// 跟踪最新 markdown，阻断 v-model 双向同步时的无限循环
let current = props.modelValue
// 是否处于「刚载入新内容」阶段。编辑器对载入内容做序列化归一化（典型表现：
// 末尾补一个换行 / trailing 插件补一个空段落）后回传的 markdown，与原文仅
// 尾部换行差异——这种回传不应回传父级，否则会令 doc 变化、把刚打开/恢复的
// 文档立刻标脏。任何「实质性」差异（用户真正在编辑）都会清除该标记并正常回传。
let justLoaded = true
const stripTrailingNL = (s: string): string => s.replace(/\n+$/, '')

const search = useSearch()

const { get } = useEditor((root) =>
  Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, current)
      // 文档变化时序列化为 markdown 回传父组件
      ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
        if (markdown === current) return
        const prev = current
        current = markdown
        // 载入归一化：与上一份仅尾部换行差异 -> 不回传，避免「打开/恢复草稿即脏」
        if (justLoaded && stripTrailingNL(markdown) === stripTrailingNL(prev)) return
        justLoaded = false
        emit('update:modelValue', markdown)
      })
    })
    .config(nord)
    .use(commonmark)
    .use(codeBlockView)
    .use(codeBlockTabKeymap)
    .use(gfm)
    .use(listener)
    .use(history)
    .use(clipboard)
    .use(shikiCodeBlock)
    .use(trailing)
    .use(searchPlugin)
    .use(searchCommand)
)

// 外部修改 markdown（如打开文件）时同步进编辑器
watch(
  () => props.modelValue,
  (val) => {
    if (val === current) return
    current = val
    justLoaded = true // 新内容载入，吸收其首次序列化归一化
    const editor = get()
    if (editor) editor.action(replaceAll(val))
  }
)

// 查询词变化 / 文档内容变化 -> 重新搜索
watch(
  () => [search.query.value, props.modelValue],
  () => {
    const editor = get()
    if (editor) editor.action(callCommand(searchCommand.key, 'search'))
  }
)

// SearchBar 请求的动作
watch(
  () => search.pendingAction.value,
  (action) => {
    if (!action) return
    const editor = get()
    if (editor) editor.action(callCommand(searchCommand.key, action))
    search.pendingAction.value = null
  }
)
</script>

<template>
  <Milkdown class="milkdown" />
</template>
