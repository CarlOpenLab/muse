/**
 * Typora 式格式化命令总线。
 *
 * 一个 FormatAction 字符串统一描述「标题/段落/列表/引用/表格/行内格式」等操作，
 * 三条入口都汇到这里执行：
 * - 原生菜单 / 右键菜单 / AI：走 useEditorControl 的 pendingAction（MilkdownCore 消费）
 * - 编辑器内快捷键：prose keymap 插件发 `muse:format` 窗口事件，MilkdownCore 监听执行
 *
 * 全部走 Milkdown command / ProseMirror transaction，⌘Z 可撤销。
 */
import { callCommand } from '@milkdown/utils'
import { editorViewCtx, type CmdKey } from '@milkdown/core'
import type { Ctx } from '@milkdown/ctx'
import {
  wrapInHeadingCommand,
  turnIntoTextCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  createCodeBlockCommand,
  insertHrCommand,
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  toggleLinkCommand,
  sinkListItemCommand,
  liftListItemCommand,
} from '@milkdown/preset-commonmark'
import {
  toggleStrikethroughCommand,
  insertTableCommand,
  addRowBeforeCommand,
  addRowAfterCommand,
  addColBeforeCommand,
  addColAfterCommand,
  goToNextTableCellCommand,
  goToPrevTableCellCommand,
} from '@milkdown/preset-gfm'
import type { Node as PMNode } from '@milkdown/prose/model'
import { CellSelection, deleteRow, deleteColumn, deleteTable, cellAround } from '@milkdown/prose/tables'

export type FormatAction =
  // 段落
  | `heading-${1 | 2 | 3 | 4 | 5 | 6}`
  | 'paragraph'
  | 'increase-heading'
  | 'decrease-heading'
  | 'quote'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'code-fence'
  | 'math-block'
  | 'hr'
  | 'table'
  // 行内格式
  | 'bold'
  | 'italic'
  | 'strike'
  | 'inline-code'
  | 'link'
  | 'clear-format'
  // 列表缩进
  | 'sink-list'
  | 'lift-list'
  // 表格操作（依赖当前单元格选区）
  | 'table-row-above'
  | 'table-row-below'
  | 'table-col-left'
  | 'table-col-right'
  | 'table-delete-row'
  | 'table-delete-col'
  | 'table-delete'
  | 'table-next-cell'
  | 'table-prev-cell'

type ViewLike = { state: { selection: { $from: { node(d: number): PMNode; depth: number } } } }

/** 光标位置的祖先链里找指定类型节点 */
function ancestor(view: ViewLike, name: string): { node: PMNode; depth: number } | null {
  const { $from } = view.state.selection
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d)
    if (n.type.name === name) return { node: n, depth: d }
  }
  return null
}

/** 是否在表格内 */
export function inTable(view: ViewLike): boolean {
  const { $from } = view.state.selection
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'table') return true
  }
  return false
}

/**
 * 执行一个格式化动作。在 editor.action((ctx) => runFormat(ctx, action)) 中调用。
 * 返回是否命中并执行了动作（未命中交给调用方决定是否放行默认行为）。
 */
export function runFormat(ctx: Ctx, action: FormatAction): boolean {
  const view = ctx.get(editorViewCtx)
  const call = (key: string | CmdKey<any>, payload?: unknown): void => {
    view.focus()
    callCommand(key as CmdKey<any>, payload as never)(ctx)
  }

  switch (action) {
    // ---- 段落 ----
    case 'paragraph':
      call(turnIntoTextCommand.key)
      return true
    case 'heading-1':
    case 'heading-2':
    case 'heading-3':
    case 'heading-4':
    case 'heading-5':
    case 'heading-6': {
      const level = Number(action.split('-')[1])
      const h = ancestor(view, 'heading')
      // 同级标题再按一次 → 退回正文（Typora 行为）
      call(h && (h.node.attrs.level as number) === level ? turnIntoTextCommand.key : wrapInHeadingCommand.key, level)
      return true
    }
    case 'increase-heading': {
      const h = ancestor(view, 'heading')
      const next = h ? Math.min(6, (h.node.attrs.level as number) + 1) : 1
      call(wrapInHeadingCommand.key, next)
      return true
    }
    case 'decrease-heading': {
      const h = ancestor(view, 'heading')
      if (!h) return true
      const level = (h.node.attrs.level as number) - 1
      call(level < 1 ? turnIntoTextCommand.key : wrapInHeadingCommand.key, level)
      return true
    }
    case 'quote': {
      const q = ancestor(view, 'blockquote')
      call(q ? turnIntoTextCommand.key : wrapInBlockquoteCommand.key)
      return true
    }
    case 'bullet-list': {
      const list = nearestList(view)
      call(list === 'bullet_list' ? liftListItemCommand.key : wrapInBulletListCommand.key)
      return true
    }
    case 'ordered-list': {
      const list = nearestList(view)
      call(list === 'ordered_list' ? liftListItemCommand.key : wrapInOrderedListCommand.key)
      return true
    }
    case 'task-list': {
      toggleTaskList(ctx)
      return true
    }
    case 'code-fence': {
      const { $from } = view.state.selection
      const inCode = $from.node($from.depth).type.name === 'code_block'
      call(inCode ? turnIntoTextCommand.key : createCodeBlockCommand.key, '')
      return true
    }
    case 'math-block': {
      // plugin-math 提供 math_block 节点（无预置命令）：在光标处插入空公式块
      const { state } = view
      const mathBlock = state.schema.nodes.math_block
      if (!mathBlock) return true
      const node = mathBlock.create({ value: '' })
      view.dispatch(state.tr.replaceSelectionWith(node).scrollIntoView())
      view.focus()
      return true
    }
    case 'hr':
      call(insertHrCommand.key)
      return true
    case 'table':
      call(insertTableCommand.key, { row: 3, col: 3 })
      return true
    // ---- 行内格式 ----
    case 'bold':
      call(toggleStrongCommand.key)
      return true
    case 'italic':
      call(toggleEmphasisCommand.key)
      return true
    case 'strike':
      call(toggleStrikethroughCommand.key)
      return true
    case 'inline-code':
      call(toggleInlineCodeCommand.key)
      return true
    case 'link':
      // 需要 href：UI 层先弹输入框，再走 dispatchFormat('link', href)
      return true
    case 'clear-format': {
      const { state } = view
      const { from, to, empty } = state.selection
      if (empty) {
        // 光标处：清除「下次输入将带的标记」
        view.dispatch(state.tr.setStoredMarks([]))
      } else {
        view.dispatch(state.tr.removeMark(from, to))
      }
      return true
    }
    // ---- 列表缩进 ----
    case 'sink-list':
      call(sinkListItemCommand.key)
      return true
    case 'lift-list':
      call(liftListItemCommand.key)
      return true
    // ---- 表格 ----
    case 'table-row-above':
      call(addRowBeforeCommand.key)
      return true
    case 'table-row-below':
      call(addRowAfterCommand.key)
      return true
    case 'table-col-left':
      call(addColBeforeCommand.key)
      return true
    case 'table-col-right':
      call(addColAfterCommand.key)
      return true
    case 'table-delete-row':
    case 'table-delete-col':
    case 'table-delete': {
      const { state } = view
      if (!inTable(view)) return true
      view.dispatch(
        state.tr.setSelection(cellSelectionAtCursor(state))
      )
      const cmd =
        action === 'table-delete-row' ? deleteRow : action === 'table-delete-col' ? deleteColumn : deleteTable
      cmd(state, (tr) => view.dispatch(tr.scrollIntoView()))
      return true
    }
    case 'table-next-cell':
      call(goToNextTableCellCommand.key)
      return true
    case 'table-prev-cell':
      call(goToPrevTableCellCommand.key)
      return true
    default:
      return false
  }
}

/** 给 'link' 动作补上 href 后真正执行（UI 弹窗确认后调用） */
export function applyLink(ctx: Ctx, href: string): void {
  const view = ctx.get(editorViewCtx)
  view.focus()
  callCommand(toggleLinkCommand.key, { href })(ctx)
}

/** 最近一级列表类型（不在列表里返回 null） */
function nearestList(view: ViewLike): string | null {
  const { $from } = view.state.selection
  for (let d = $from.depth; d > 0; d--) {
    const name = $from.node(d).type.name
    if (name === 'bullet_list' || name === 'ordered_list') return name
  }
  return null
}

/** 光标所在单元格 → 覆盖该单元格的 CellSelection（表格行列命令依赖它） */
function cellSelectionAtCursor(state: { selection: { $from: any }; doc: PMNode }): CellSelection {
  const $cell = cellAround(state.selection.$from) ?? cellAround(state.doc.resolve(state.selection.$from.pos))
  if ($cell) return CellSelection.create(state.doc, $cell.pos)
  return state.selection as unknown as CellSelection
}

/** 任务列表：不在列表 → 包成带勾选的列表；在列表 → 切换当前项勾选态 */
function toggleTaskList(ctx: Ctx): void {
  const view = ctx.get(editorViewCtx)
  const { state } = view
  const { $from } = state.selection
  let itemDepth = -1
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === 'list_item') {
      itemDepth = d
      break
    }
  }
  if (itemDepth === -1) {
    view.focus()
    callCommand(wrapInBulletListCommand.key)(ctx)
    // 包裹后光标已进列表项：重新定位并置为已勾选
    const $from2 = view.state.selection.$from
    for (let d = $from2.depth; d > 0; d--) {
      if ($from2.node(d).type.name === 'list_item') {
        const item = $from2.node(d)
        view.dispatch(view.state.tr.setNodeMarkup($from2.before(d), undefined, { ...item.attrs, checked: true }))
        break
      }
    }
    return
  }
  const item = $from.node(itemDepth)
  const pos = $from.before(itemDepth)
  const current = item.attrs.checked
  // 勾选态循环：未定 → 已勾 → 未勾 → 未定
  const next = current === null || current === undefined ? true : current ? false : null
  view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...item.attrs, checked: next }))
  view.focus()
}
