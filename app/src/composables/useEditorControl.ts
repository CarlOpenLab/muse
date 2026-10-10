import { ref } from 'vue'
import type { ToolResult } from '../chat/editorTools'
import type { FormatAction } from '../editor/formatCommands'

/**
 * 跨组件编辑器控制信号。
 *
 * useFile（在 App 层）产出一次性动作请求，MilkdownCore（编辑器内部）消费。
 * 用模块级单例 ref 解耦：useFile 无需拿到 editor 实例即可发起请求，
 * MilkdownCore 在编辑器就绪后读取并执行，执行完清空。
 *
 * 典型用途：标题输入框回车后，请求「光标落进正文开头」；AI 侧栏请求「把回答插入正文」。
 */
export type EditorActionType =
  | 'focus-body'
  | 'insert-text'
  | 'replace-selection'
  | 'tool'
  | 'format'
  | 'serialize'
  | 'insert-image'
  | 'select-cell'
export interface EditorAction {
  type: EditorActionType
  /** insert-text / replace-selection 时携带：要按 markdown 解析插入的文本 */
  text?: string
  /** replace-selection：目标区间（编辑器内 ProseMirror 位置） */
  from?: number
  to?: number
  /** replace-selection：原文快照，用于替换前一致性校验 */
  expectedText?: string
  /** tool：AI 工具调用（agent loop 执行文档编辑） */
  tool?: { name: string; args: unknown }
  /** tool：执行完成后回调（agent loop 需要拿到结果反馈给模型） */
  resolve?: (r: ToolResult) => void
  /** format：Typora 式格式化动作（标题/列表/表格/行内格式…） */
  format?: FormatAction
  /** format: 'link' 时携带的链接地址；serialize / insert-image 的结果回调 */
  href?: string
  resolveMd?: (markdown: string) => void
  /** insert-image：已落盘的图片 src 与替代文本 */
  imageSrc?: string
  imageAlt?: string
  /** select-cell：右键菜单前把点击处表格单元格设为 CellSelection（屏幕坐标） */
  x?: number
  y?: number
  /** 自增序号：保证连续发起同类动作时 ref 引用变化、watch 触发 */
  seq: number
}

const pendingAction = ref<EditorAction | null>(null)
let seq = 0

/** 发起一次编辑器动作请求（编辑器未就绪时会等待就绪后执行）。 */
export function dispatchEditorAction(type: EditorActionType): void {
  pendingAction.value = { type, seq: ++seq }
}

/** 请求把光标切进正文编辑器（标题输入框回车 → 正文开头）。 */
export function dispatchEditorFocusBody(): void {
  pendingAction.value = { type: 'focus-body', seq: ++seq }
}

/** 请求把一段 markdown 按语法解析后插入到光标处（AI「插入到正文」）。 */
export function dispatchEditorInsert(text: string): void {
  pendingAction.value = { type: 'insert-text', text, seq: ++seq }
}

/** 请求用一段 markdown 替换选中的原文（AI「替换选中」）。 */
export function dispatchEditorReplaceSelection(
  from: number,
  to: number,
  expectedText: string,
  text: string
): void {
  pendingAction.value = { type: 'replace-selection', from, to, expectedText, text, seq: ++seq }
}

/**
 * 请求执行一个文档编辑工具（agent loop 用）。
 * 返回 Promise：MilkdownCore 在编辑器就绪后执行并 resolve 结果；
 * 编辑器未就绪时动作会挂起等待（Promise 同步等待）。
 * 超时（8s）保护：未打开文档等场景下避免 agent loop 永久挂起。
 */
export function dispatchEditorTool(name: string, args: unknown): Promise<ToolResult> {
  return new Promise((resolve) => {
    const action: EditorAction = { type: 'tool', tool: { name, args }, resolve, seq: ++seq }
    pendingAction.value = action
    setTimeout(() => {
      // 动作还在排队（未被编辑器消费）→ 超时返回失败，让 agent 得知工具不可用
      if (pendingAction.value === action) {
        pendingAction.value = null
        resolve({ ok: false, message: '编辑器未就绪，无法执行文档操作' })
      }
    }, 8000)
  })
}

export function useEditorControl() {
  return { pendingAction }
}

/** 请求执行一个 Typora 式格式化动作（菜单 / 右键 / 链接弹窗确认后调用）。 */
export function dispatchFormat(format: FormatAction, href?: string): void {
  pendingAction.value = { type: 'format', format, href, seq: ++seq }
}

/** 请求把当前编辑器内容序列化为 markdown（源代码模式 / 导出用）。 */
export function dispatchSerialize(resolveMd: (markdown: string) => void): void {
  pendingAction.value = { type: 'serialize', resolveMd, seq: ++seq }
}

/** 请求在光标处插入一张已落盘的图片。 */
export function dispatchInsertImage(src: string, alt = ''): void {
  pendingAction.value = { type: 'insert-image', imageSrc: src, imageAlt: alt, seq: ++seq }
}

/** 右键表格前：把点击处的单元格设为当前选区（行列命令依赖它）。 */
export function dispatchSelectCell(x: number, y: number): void {
  pendingAction.value = { type: 'select-cell', x, y, seq: ++seq }
}
