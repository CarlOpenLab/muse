/**
 * 块悬浮手柄（Notion 式）。
 *
 * 底座用官方 @milkdown/plugin-block：它负责悬浮检测（pointermove + 节流）、
 * 点击手柄时给块建 NodeSelection、拖拽时写 view.dragging（原生拖拽排序）。
 * 本文件只做三件事：
 *   1. 把手柄 UI（Vue）挂进 BlockProvider 的 content；
 *   2. 补一条 gutter 桥——官方检测挂在 .ProseMirror 上，鼠标从正文左侧
 *      48px 留白进入时收不到事件，这里在 .editor-scroll 上转发；
 *   3. 菜单执行体（转换为 / 副本 / 复制 Markdown / 删除）。
 *
 * 接线（MilkdownCore.vue）：
 *   .use(block)
 *   .config((ctx) => {
 *     ctx.set(blockConfig.key, { filterNodes: (pos) => pos.depth === 0 })
 *     ctx.set(block.key, { view: (view) => new BlockHandleView(ctx, view) })
 *   })
 */
import { createApp, watch, type App as VueApp } from 'vue'
import type { Ctx } from '@milkdown/ctx'
import type { PluginView } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import { BlockProvider, blockServiceInstance, type BlockService } from '@milkdown/plugin-block'
import BlockLayer from './BlockLayer.vue'
import {
  closeBlockMenu,
  openBlockMenu,
  setBlockMenuExecutor,
  type BlockMenuState,
} from './blockMenuState'
import {
  convertBlock,
  copyBlockMarkdown,
  deleteBlock,
  duplicateBlock,
  formatAt,
  insertParagraphAfter,
  topLevelBlockAtY,
} from './blockOps'
import type { FormatAction } from '../formatCommands'
import {
  blockSelectionKey,
  inBlockRange,
  rangeBounds,
} from './blockSelectionPlugin'
import { setGroupDragActive } from './blockSelectionState'
import { useViewMode } from '../../composables/useViewMode'

export class BlockHandleView implements PluginView {
  #ctx: Ctx
  #view: EditorView
  #layer: HTMLElement
  #handle: HTMLElement
  #app: VueApp
  #provider: BlockProvider
  /** ＋ 起手标记：拦住从 ＋ 发起的拖拽（dragstart 守卫用） */
  #addPressed = false
  #cleanup: () => void = () => {}
  #stopModeWatch: (() => void) | null = null
  #destroyed = false

  constructor(ctx: Ctx, view: EditorView) {
    this.#ctx = ctx
    this.#view = view

    const layer = document.createElement('div')
    layer.className = 'muse-block-layer'
    layer.setAttribute('data-export-hide', '')
    document.body.appendChild(layer)

    const app = createApp(BlockLayer, {
      onAdd: () => this.#addBlock(),
      onOpenMenu: () => this.#openActionMenu(),
      onPlusPressed: (v: boolean) => {
        this.#addPressed = v
      },
    })
    app.mount(layer)
    this.#app = app
    this.#layer = layer

    const handle = layer.querySelector('.muse-block-handle')
    if (!(handle instanceof HTMLElement)) throw new Error('muse: .muse-block-handle 未渲染')
    this.#handle = handle

    this.#provider = new BlockProvider({
      ctx,
      content: handle,
      // 挂 body + fixed：躲开 .editor-scroll 的 overflow 裁切，窄窗口也能显示
      root: document.body,
      floatingUIOptions: { strategy: 'fixed' },
      getOffset: () => 6,
      getPlacement: () => 'left-start',
    })

    this.#bindGutter()
    this.#bindDragGuard()
    this.#bindFocusGuard()
    setBlockMenuExecutor((id, s) => this.#runMenuAction(id, s))

    // 源码模式：编辑器本体被 v-show 隐藏，浮层也必须收起
    this.#stopModeWatch = watch(useViewMode().viewMode, (mode) => {
      if (mode.source) {
        this.#provider.hide()
        closeBlockMenu()
      }
    })

    this.update()
  }

  update = (): void => {
    if (this.#destroyed) return
    this.#provider.update()
  }

  destroy = (): void => {
    this.#destroyed = true
    setBlockMenuExecutor(null)
    closeBlockMenu()
    this.#stopModeWatch?.()
    this.#cleanup()
    try {
      this.#provider.destroy()
    } catch {
      /* provider 已经随视图销毁时忽略 */
    }
    this.#app.unmount()
    this.#layer.remove()
  }

  // ---- 菜单动作 ----

  #runMenuAction(id: string, s: BlockMenuState): void {
    const view = this.#view
    if (id === 'op-delete') {
      deleteBlock(view, s.offset)
      return
    }
    if (id === 'op-duplicate') {
      duplicateBlock(view, s.offset)
      return
    }
    if (id === 'op-copy') {
      void copyBlockMarkdown(this.#ctx, view, s.offset)
      return
    }
    const action = id as FormatAction
    if (s.mode === 'insert') formatAt(this.#ctx, view, s.caretPos, action)
    else convertBlock(this.#ctx, view, s.offset, action)
  }

  /** ＋：在 hover 块后插入空段落，光标落入，并弹出类型菜单。 */
  #addBlock(): void {
    const view = this.#view
    const active = this.#provider.active
    if (!active) return
    const caret = insertParagraphAfter(view, active.$pos.pos)
    if (caret < 0) return
    this.#provider.hide()
    const rect = view.coordsAtPos(view.state.selection.from)
    openBlockMenu({
      mode: 'insert',
      offset: active.$pos.pos + active.node.nodeSize,
      caretPos: view.state.selection.from,
      anchor: { left: rect.left, top: rect.bottom + 4, bottom: rect.bottom },
    })
  }

  /** ⠿ 点击：以当前块为锚点打开操作菜单。 */
  #openActionMenu(): void {
    const active = this.#provider.active
    if (!active) return
    const rect = active.el.getBoundingClientRect()
    openBlockMenu({
      mode: 'action',
      offset: active.$pos.pos,
      blockKind: active.node.type.name,
      anchor: { left: rect.left, top: rect.top, bottom: rect.bottom },
    })
  }

  // ---- gutter 桥：鼠标从正文左侧留白进入时也能出手柄 ----

  #getService(): BlockService | null {
    try {
      return this.#ctx.get(blockServiceInstance.key) ?? null
    } catch {
      return null
    }
  }

  #bindGutter(): void {
    const view = this.#view
    const scroll = view.dom.closest('.editor-scroll') as HTMLElement | null
    if (!scroll) return
    const service = this.#getService()

    const onMove = (e: PointerEvent): void => {
      if (this.#destroyed || !view.editable || view.composing) return
      const target = e.target as Node | null
      if (target && view.dom.contains(target)) return // 正文内：官方 pointermove 已处理
      if (target && this.#handle.contains(target)) return // 手柄自身：别闪
      if (e.clientX >= view.dom.getBoundingClientRect().left) return // 右侧空白不接管
      const hit = topLevelBlockAtY(view, e.clientY)
      if (!hit || !service) {
        this.#provider.hide()
        return
      }
      // 复用官方服务：节流、命中、#active 写入（mousedown 建选区 / dragstart 拖拽都依赖它）
      service.mousemoveCallback(view, { clientY: e.clientY } as MouseEvent)
    }
    const onLeave = (e: PointerEvent): void => {
      // 手柄/菜单是挂 body 的独立浮层，鼠标从正文移上去也算离开 .editor-scroll。
      // 若直接隐藏，手柄会变 pointer-events:none，click 就永远落不到按钮上。
      const to = e.relatedTarget as Node | null
      if (to && (this.#handle.contains(to) || this.#layer.contains(to))) return
      this.#provider.hide()
    }
    // 从手柄离开（去菜单 / 回正文 / 去工具栏）：正文由官方接管，其余收起
    const onHandleLeave = (e: PointerEvent): void => {
      if (this.#addPressed) return // ＋ 按下期间手柄必须保持可点
      const to = e.relatedTarget as Node | null
      if (to && this.#handle.contains(to)) return
      if (to && view.dom.contains(to)) return // 回正文：交给官方 pointermove
      const menu = document.querySelector('.muse-block-menu')
      if (to && menu && menu.contains(to)) return
      this.#provider.hide()
    }

    scroll.addEventListener('pointermove', onMove)
    scroll.addEventListener('pointerleave', onLeave)
    this.#handle.addEventListener('pointerleave', onHandleLeave)
    const prev = this.#cleanup
    this.#cleanup = () => {
      scroll.removeEventListener('pointermove', onMove)
      scroll.removeEventListener('pointerleave', onLeave)
      this.#handle.removeEventListener('pointerleave', onHandleLeave)
      prev()
    }
  }

  // ---- 焦点守卫：按手柄不夺焦 ----
  // 按钮的 mousedown 默认行为会把 DOM 焦点移到按钮上（官方 service 只在
  // 「非拖拽的 mouseup」里 rAF 补救，实测量不够），于是随后的 ⌘Z / ⌘B / 打字
  // 全部收不到。这里在下一次事件循环把焦点交还编辑器：此时浏览器的默认聚焦
  // 已经发生，能稳定生效。
  #bindFocusGuard(): void {
    const onMouseDown = (): void => {
      window.setTimeout(() => {
        if (this.#destroyed) return
        const active = document.activeElement
        if (active instanceof HTMLElement && this.#handle.contains(active)) {
          this.#view.focus()
        }
      }, 0)
    }
    this.#handle.addEventListener('mousedown', onMouseDown)
    const prev = this.#cleanup
    this.#cleanup = () => {
      this.#handle.removeEventListener('mousedown', onMouseDown)
      prev()
    }
  }

  // ---- 拖拽守卫：＋ 起手不拖手柄；选区内拖拽升级为整片移动 ----

  #bindDragGuard(): void {
    // 注册在 document 捕获阶段：先于手柄元素上官方 service 的 dragstart
    const onDragStart = (e: DragEvent): void => {
      if (!this.#addPressed) return
      const t = e.target as Node | null
      if (t && this.#handle.contains(t)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    // 冒泡阶段（晚于 service 在柄上的监听）：手柄命中块落在已选范围内时，
    // 把单块拖拽替换成整片范围的 slice（Notion 式组拖拽）。
    // 真正的删除+插入由 blockSelectionPlugin 的 handleDrop 接管（见那里的注释）。
    const onDragStartUpgrade = (e: DragEvent): void => {
      const active = this.#provider.active
      const range = blockSelectionKey.getState(this.#view.state)
      if (!active || !range) return
      if (!inBlockRange(this.#view.state.doc, range, active.$pos.pos)) return
      const { from, to } = rangeBounds(this.#view.state.doc, range)
      const slice = this.#view.state.doc.slice(from, to)
      this.#view.dragging = { slice, move: true }
      setGroupDragActive(true)
      const { dom, text } = this.#view.serializeForClipboard(slice)
      if (e.dataTransfer) {
        e.dataTransfer.clearData()
        e.dataTransfer.setData('text/html', dom.innerHTML)
        e.dataTransfer.setData('text/plain', text)
      }
    }
    const onDragEnd = (): void => {
      setGroupDragActive(false)
    }
    document.addEventListener('dragstart', onDragStart, true)
    document.addEventListener('dragstart', onDragStartUpgrade)
    document.addEventListener('dragend', onDragEnd)
    const prev = this.#cleanup
    this.#cleanup = () => {
      document.removeEventListener('dragstart', onDragStart, true)
      document.removeEventListener('dragstart', onDragStartUpgrade)
      document.removeEventListener('dragend', onDragEnd)
      prev()
    }
  }
}
