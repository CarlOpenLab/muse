import { ref } from 'vue'

/**
 * 选中气泡工具条的按钮态（模块级单例）。
 *
 * 写入：selectionToolbarPlugin（每次选区变化时按当前 mark 计算）；
 * 读取：SelectionToolbar.vue（渲染 is-active）。
 * 只读选区，不写 useEditorSelection 快照 —— 那条通道归 selectionPlugin 独占，
 * AI 侧栏的「已选中 / 替换选中」不受工具条影响。
 */
export interface InlineMarkState {
  bold: boolean
  italic: boolean
  strike: boolean
  inlineCode: boolean
  link: boolean
}

const EMPTY: InlineMarkState = {
  bold: false,
  italic: false,
  strike: false,
  inlineCode: false,
  link: false,
}

const marks = ref<InlineMarkState>({ ...EMPTY })

export function setInlineMarkState(next: InlineMarkState): void {
  marks.value = next
}

export function resetInlineMarkState(): void {
  marks.value = { ...EMPTY }
}

export function useInlineMarkState() {
  return { marks }
}
