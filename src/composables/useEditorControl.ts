import { ref } from 'vue'
import type { ToolResult } from '../chat/editorTools'

/**
 * 跨组件编辑器控制信号。
 *
 * useFile（在 App 层）产出一次性动作请求，MilkdownCore（编辑器内部）消费。
 * 用模块级单例 ref 解耦：useFile 无需拿到 editor 实例即可发起请求，
 * MilkdownCore 在编辑器就绪后读取并执行，执行完清空。
 *
 * 典型用途：新建文档后，请求「聚焦标题下一行」；AI 侧栏请求「把回答插入正文」。
 */
export type EditorActionType =
  | 'focus-after-title'
  | 'insert-text'
  | 'replace-selection'
  | 'tool'
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
  /** 自增序号：保证连续发起同类动作时 ref 引用变化、watch 触发 */
  seq: number
}

const pendingAction = ref<EditorAction | null>(null)
let seq = 0

/** 发起一次编辑器动作请求（编辑器未就绪时会等待就绪后执行）。 */
export function dispatchEditorAction(type: EditorActionType): void {
  pendingAction.value = { type, seq: ++seq }
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
