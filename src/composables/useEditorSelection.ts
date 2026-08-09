import { ref } from 'vue'

export interface SelectionSnapshot {
  /** ProseMirror 文档位置（replace 目标区间） */
  from: number
  to: number
  /** 选中文本（trim 后） */
  text: string
}

/**
 * 编辑器当前非空选区快照（模块级单例）。
 *
 * 写入：MilkdownCore 的 selectionPlugin（每次 selection 变化时同步）；
 * 读取：ChatPanel（显示「已选中 N 字」操作条 / 注入选中文本上下文 / 替换选中）。
 * 空选区 / 纯空白选区时置 null。
 */
const snapshot = ref<SelectionSnapshot | null>(null)

export function setSelectionSnapshot(s: SelectionSnapshot | null): void {
  snapshot.value = s
}

export function useEditorSelection() {
  return { snapshot }
}
