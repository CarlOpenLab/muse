import { ref } from 'vue'

/**
 * 跨组件编辑器控制信号。
 *
 * useFile（在 App 层）产出一次性动作请求，MilkdownCore（编辑器内部）消费。
 * 用模块级单例 ref 解耦：useFile 无需拿到 editor 实例即可发起请求，
 * MilkdownCore 在编辑器就绪后读取并执行，执行完清空。
 *
 * 典型用途：新建文档后，请求「聚焦标题下一行」。
 */
export type EditorActionType = 'focus-after-title'
export interface EditorAction {
  type: EditorActionType
  /** 自增序号：保证连续发起同类动作时 ref 引用变化、watch 触发 */
  seq: number
}

const pendingAction = ref<EditorAction | null>(null)
let seq = 0

/** 发起一次编辑器动作请求（编辑器未就绪时会等待就绪后执行）。 */
export function dispatchEditorAction(type: EditorActionType): void {
  pendingAction.value = { type, seq: ++seq }
}

export function useEditorControl() {
  return { pendingAction }
}
