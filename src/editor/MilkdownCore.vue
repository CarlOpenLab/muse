<script setup lang="ts">
import { watch } from 'vue'
import { useEditor, Milkdown } from '@milkdown/vue'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { nord } from '@milkdown/theme-nord'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'
import { trailing } from '@milkdown/plugin-trailing'
import { replaceAll, callCommand } from '@milkdown/utils'
import { TextSelection } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import '@milkdown/theme-nord/style.css'
import { shikiCodeBlock } from './shiki/shikiCodeBlock'
import { codeBlockView } from './codeBlockView'
import { codeBlockTabKeymap } from './codeBlockKeymap'
import { searchPlugin } from './searchPlugin'
import { searchCommand } from './searchCommands'
import { placeholderPlugin } from './placeholderPlugin'
import { useSearch } from '../composables/useSearch'
import { useEditorControl } from '../composables/useEditorControl'

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
const { pendingAction } = useEditorControl()

const { get, loading } = useEditor((root) =>
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
    .use(placeholderPlugin)
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

// 编辑器就绪后执行待办动作（如新建文档后聚焦标题下一行）。
// 同时依赖 loading 与 pendingAction：编辑器未就绪时等就绪，已就绪时等请求。
// 注册顺序在 modelValue watch 之后，保证「先 replaceAll、再聚焦」的时序。
watch(
  [loading, pendingAction],
  ([isLoading, action]) => {
    if (isLoading || !action) return
    const editor = get()
    if (!editor) return
    if (action.type === 'focus-after-title') focusAfterTitle(editor)
    pendingAction.value = null // 消费
  }
)

/**
 * 新建文档后：确保标题（首个 H1）后跟一个空段落，并把光标聚焦到该段落起始，
 * 让用户落笔在「标题下一行」而非标题里（标题留空显示「无标题」占位）。
 * 这步产生的段落插入属载入归一化范畴，不应标脏——由 justLoaded 吸收。
 */
function focusAfterTitle(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx) as EditorView
    const state = view.state
    const doc = state.doc
    const first = doc.firstChild
    if (!first) {
      view.focus()
      return
    }
    let tr = state.tr
    // 标题后若无段落，补一个空段落作为正文起始行
    if (doc.childCount < 2 || doc.child(1).type.name !== 'paragraph') {
      const pType = state.schema.nodes.paragraph
      tr = tr.insert(first.nodeSize, pType.create())
    }
    // 光标置于标题后第一段起始（paraStart+1 = 段落内容起点）
    const $pos = tr.doc.resolve(first.nodeSize + 1)
    tr = tr.setSelection(TextSelection.near($pos))
    view.dispatch(tr.scrollIntoView())
    view.focus()
  })
}

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
