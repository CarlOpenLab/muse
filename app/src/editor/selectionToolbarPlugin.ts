/**
 * 选中文字气泡工具条（Typora / Notion 式）。
 *
 * 底座用 @milkdown/plugin-tooltip 的 TooltipProvider（floating-ui 定位 + 自动跟随滚动），
 * UI 用独立 Vue app 挂到 body。只读选区算按钮态，不写 useEditorSelection 快照。
 *
 * 显示规则（shouldShow）：
 *   - 仅非空 TextSelection（NodeSelection / CellSelection 一律不弹，点 ⠿ 不误弹）
 *   - 编辑器有焦点，或焦点在工具条内
 *   - 非源码模式、非代码块内、多块范围选择未激活
 */
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type PluginView,
} from '@milkdown/prose/state'
import type { ResolvedPos } from '@milkdown/prose/model'
import type { EditorView } from '@milkdown/prose/view'
import { $prose } from '@milkdown/utils'
import { TooltipProvider } from '@milkdown/plugin-tooltip'
import { createApp, watch, type App as VueApp } from 'vue'
import SelectionToolbar from '../components/SelectionToolbar.vue'
import {
  resetInlineMarkState,
  setInlineMarkState,
  type InlineMarkState,
} from './selectionToolbarState'
import { hasBlockRange } from './block/blockSelectionState'
import { useViewMode } from '../composables/useViewMode'
import { dispatchFormat } from '../composables/useEditorControl'
import { openLinkModal } from '../composables/useLinkModal'
import type { FormatAction } from './formatCommands'

/** 行内 mark 名（commonmark / gfm 的 schema 名）→ 按钮态字段 */
const MARK_PROBES: ReadonlyArray<[keyof InlineMarkState, string]> = [
  ['bold', 'strong'],
  ['italic', 'emphasis'],
  ['strike', 'strike_through'],
  ['inlineCode', 'inlineCode'],
  ['link', 'link'],
]

/** 光标/选区是否落在代码块或公式块内（这类块里行内格式无意义，不弹）。 */
function inVerbatimBlock($from: ResolvedPos): boolean {
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name
    if (name === 'code_block' || name === 'math_block') return true
  }
  return false
}

class SelectionToolbarView implements PluginView {
  #view: EditorView
  #element: HTMLElement
  #app: VueApp
  #provider: TooltipProvider
  #stopModeWatch: (() => void) | null = null
  #destroyed = false

  constructor(view: EditorView) {
    this.#view = view

    const element = document.createElement('div')
    element.className = 'muse-sel-toolbar'
    element.setAttribute('data-export-hide', '')

    const app = createApp(SelectionToolbar, {
      onAction: (id: string) => this.#run(id),
    })
    app.mount(element)
    this.#app = app
    this.#element = element

    this.#provider = new TooltipProvider({
      content: element,
      // 挂 body + fixed：躲开 .editor-scroll 的 overflow 裁切，并启用滚动自动跟随
      root: document.body,
      debounce: 20,
      offset: 10,
      floatingUIOptions: { strategy: 'fixed' },
      shouldShow: (v) => this.#shouldShow(v),
    })

    // 源码模式：编辑器本体被 v-show 隐藏，工具条也必须收起
    this.#stopModeWatch = watch(useViewMode().viewMode, (mode) => {
      if (mode.source) {
        this.#provider.hide()
        resetInlineMarkState()
      }
    })
  }

  update = (v: EditorView, prev: EditorState | undefined): void => {
    if (this.#destroyed) return
    this.#provider.update(v, prev)
    this.#syncMarks(v)
  }

  destroy = (): void => {
    this.#destroyed = true
    this.#stopModeWatch?.()
    try {
      this.#provider.destroy()
    } catch {
      /* 视图已销毁时忽略 */
    }
    resetInlineMarkState()
    this.#app.unmount()
    this.#element.remove()
  }

  #run(id: string): void {
    if (id === 'link') {
      openLinkModal()
      return
    }
    dispatchFormat(id as FormatAction)
  }

  #shouldShow(v: EditorView): boolean {
    if (this.#destroyed) return false
    const { selection, doc } = v.state
    if (!(selection instanceof TextSelection)) return false
    if (selection.empty) return false
    if (!v.editable) return false
    if (useViewMode().viewMode.value.source) return false
    if (hasBlockRange()) return false
    const isToolbarFocused = this.#element.contains(document.activeElement)
    if (!v.hasFocus() && !isToolbarFocused) return false
    if (!doc.textBetween(selection.from, selection.to).trim()) return false
    if (inVerbatimBlock(selection.$from)) return false
    return true
  }

  /** 按当前选区计算 5 个按钮的 active 态（写模块 ref，组件渲染）。 */
  #syncMarks(v: EditorView): void {
    const { state } = v
    const { selection, storedMarks, schema } = state
    const { from, to, empty } = selection
    const out: InlineMarkState = {
      bold: false,
      italic: false,
      strike: false,
      inlineCode: false,
      link: false,
    }
    for (const [field, markName] of MARK_PROBES) {
      const type = schema.marks[markName]
      if (!type) continue
      out[field] = empty
        ? !!type.isInSet(storedMarks ?? selection.$from.marks())
        : state.doc.rangeHasMark(from, to, type)
    }
    setInlineMarkState(out)
  }
}

export const selectionToolbar = $prose(
  () =>
    new Plugin({
      key: new PluginKey('MUSE_SELECTION_TOOLBAR'),
      view: (view) => new SelectionToolbarView(view),
    })
)
