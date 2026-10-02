<script setup lang="ts">
import { watch, onMounted, onUnmounted } from 'vue'
import { useEditor, Milkdown } from '@milkdown/vue'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, parserCtx, serializerCtx, schemaCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { nord } from '@milkdown/theme-nord'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'
import { trailing } from '@milkdown/plugin-trailing'
import { block, blockConfig } from '@milkdown/plugin-block'
import { replaceAll, callCommand } from '@milkdown/utils'
import { Slice } from '@milkdown/prose/model'
import { TextSelection } from '@milkdown/prose/state'
import { CellSelection, cellAround } from '@milkdown/prose/tables'
import type { EditorView } from '@milkdown/prose/view'
import '@milkdown/theme-nord/style.css'
import 'katex/dist/katex.min.css'
import { shikiCodeBlock } from './shiki/shikiCodeBlock'
import { codeBlockView } from './codeBlockView'
import { codeBlockTabKeymap } from './codeBlockKeymap'
import { searchPlugin } from './searchPlugin'
import { selectionPlugin } from './selectionPlugin'
import { handleEditorTool } from './editorToolHandlers'
import { searchCommand } from './searchCommands'
import { placeholderPlugin } from './placeholderPlugin'
import { typoraKeymap } from './typoraKeymap'
import { imagePastePlugin } from './imagePastePlugin'
import { focusModePlugin } from './focusModePlugin'
import { typewriterPlugin } from './typewriterPlugin'
import { BlockHandleView } from './block/blockChromePlugin'
import { blockSelectionPlugin } from './block/blockSelectionPlugin'
import { selectionToolbar } from './selectionToolbarPlugin'
import { museMath } from './math/mathPlugin'
import { runFormat, applyLink, type FormatAction } from './formatCommands'
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

/**
 * Milkdown 序列化器会把「空段落」写成 <br />（保留空行的内置行为），
 * 放在表格单元格里就是噪音（Typora 保存空单元格是干净的）。
 * 仅对形如表格行的行内做清理，不影响正文空行保留。
 */
function cleanTableBr(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) =>
      /^\s*\|.*\|\s*$/.test(line) ? line.replace(/(?:<br\s*\/?>)+/gi, '') : line
    )
    .join('\n')
}

const { get, loading } = useEditor((root) =>
  Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, current)
      // 文档变化时序列化为 markdown 回传父组件
      ctx.get(listenerCtx).markdownUpdated((_ctx, raw) => {
        const markdown = cleanTableBr(raw)
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
    .use(museMath)
    .use(listener)
    .use(history)
    .use(clipboard)
    .use(shikiCodeBlock)
    .use(trailing)
    .use(searchPlugin)
    .use(selectionPlugin)
    .use(searchCommand)
    .use(placeholderPlugin)
    .use(typoraKeymap)
    .use(imagePastePlugin)
    .use(focusModePlugin)
    .use(typewriterPlugin)
    // Notion 式块悬浮手柄：filterNodes 只取顶层块（表格/引用/代码块都能拿手柄），
    // view 注入自绘手柄 + 菜单（blockChromePlugin）
    .use(block)
    .config((ctx) => {
      ctx.set(blockConfig.key, { filterNodes: (pos) => pos.depth === 0 })
      ctx.set(block.key, { view: (view) => new BlockHandleView(ctx, view) })
    })
    // 选中文字气泡工具条（加粗/斜体/删除线/行内代码/链接）
    .use(selectionToolbar)
    // 多块范围选择（gutter 拖选整片块：删除/复制/剪切/组拖拽）
    .use(blockSelectionPlugin)
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
    if (action.type === 'focus-body') focusBodyStart(editor)
    if (action.type === 'insert-text' && action.text) insertMarkdown(editor, action.text)
    if (action.type === 'replace-selection' && action.text) {
      replaceSelection(editor, {
        from: action.from ?? 0,
        to: action.to ?? 0,
        expectedText: action.expectedText ?? '',
        text: action.text,
      })
    }
    if (action.type === 'format' && action.format) {
      // Typora 式格式化：统一走 runFormat；link 需 href（弹窗确认后携带）
      editor.action((ctx) => {
        if (action.format === 'link' && action.href) applyLink(ctx, action.href)
        else runFormat(ctx, action.format!)
      })
    }
    if (action.type === 'serialize' && action.resolveMd) {
      editor.action((ctx) => {
        // 7.x 的 Serializer 是函数：(doc) => markdown
        action.resolveMd?.(cleanTableBr(ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc)))
      })
    }
    if (action.type === 'insert-image' && action.imageSrc) {
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx) as EditorView
        const image = view.state.schema.nodes.image
        if (!image) return
        const node = image.create({ src: action.imageSrc, alt: action.imageAlt ?? '' })
        view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView())
        view.focus()
      })
    }
    if (action.type === 'select-cell') {
      // 右键表格：把点击处单元格设为 CellSelection（不打断光标所在段落，仅表格选区）
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx) as EditorView
        const pos = view.posAtCoords({ left: action.x ?? 0, top: action.y ?? 0 })?.pos
        if (pos == null) return
        const $cell = cellAround(view.state.doc.resolve(pos))
        if (!$cell) return
        view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, $cell.pos)))
      })
    }
    if (action.type === 'tool' && action.tool) {
      // AI 工具调用：在编辑器 action 中执行（持有 view/parser/schema），结果回传 agent loop
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx) as EditorView
        const parser = ctx.get(parserCtx)
        const schema = ctx.get(schemaCtx)
        const result = handleEditorTool({ view, schema, parser }, action.tool!.name, action.tool!.args)
        action.resolve?.(result)
      })
    }
    pendingAction.value = null // 消费
  }
)

// 编辑器内快捷键（typoraKeymap）→ 格式命令
function onFormatEvent(e: Event): void {
  const action = (e as CustomEvent<string>).detail as FormatAction
  const editor = get()
  if (!editor) return
  editor.action((ctx) => runFormat(ctx, action))
}
onMounted(() => window.addEventListener('muse:format', onFormatEvent))
onUnmounted(() => window.removeEventListener('muse:format', onFormatEvent))

/**
 * 光标落进正文开头（标题输入框回车触发）。
 * 编辑器 doc 只有正文、不含标题行（标题是独立单行输入框），故直接定位到首个
 * 文本块起始；TextSelection.near 对空文档、首块是列表/代码块等结构都安全。
 */
function focusBodyStart(editor: Editor): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx) as EditorView
    const { state } = view
    const $pos = state.doc.resolve(Math.min(1, state.doc.content.size))
    const tr = state.tr.setSelection(TextSelection.near($pos)).scrollIntoView()
    view.dispatch(tr)
    view.focus()
  })
}

/**
 * 把一段 markdown 按语法解析后插入到当前光标处（AI「插入到正文」）。
 * 用 parser 而非 insertText：标题 / 列表 / 代码块等块级结构能正确落地。
 * 若当前选中了文字则替换选中区域；插入后滚动到插入点并聚焦编辑器。
 */
function insertMarkdown(editor: Editor, markdown: string): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx) as EditorView
    const parser = ctx.get(parserCtx)
    const doc = parser(markdown)
    if (!doc) return
    const { state } = view
    const { from, to } = state.selection
    const slice = new Slice(doc.content, 0, 0)
    view.dispatch(state.tr.replace(from, to, slice).scrollIntoView())
    view.focus()
  })
}

/**
 * 用一段 markdown 替换选中区域（AI「替换选中」）。
 * 替换前做原文一致性校验：若选区内容已被用户改动（from/to 失效），
 * 退化为在选区起点插入，避免误删用户新写的内容。
 */
function replaceSelection(
  editor: Editor,
  a: { from: number; to: number; expectedText: string; text: string }
): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx) as EditorView
    const parser = ctx.get(parserCtx)
    const doc = parser(a.text)
    if (!doc) return
    const { state } = view
    const size = state.doc.content.size
    const f = Math.min(a.from, size)
    const t = Math.min(a.to, size)
    const current = state.doc.textBetween(Math.min(f, t), Math.max(f, t), '\n').trim()
    const matched = current === a.expectedText.trim()
    const slice = new Slice(doc.content, 0, 0)
    const tr = matched
      ? state.tr.replace(f, t, slice)
      : state.tr.insert(f, slice.content)
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
