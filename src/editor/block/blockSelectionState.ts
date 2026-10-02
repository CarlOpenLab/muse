import { ref } from 'vue'

/**
 * 多块范围选择状态（模块级单例）。
 *
 * 写入：blockSelectionPlugin（gutter 起手/扩展/清除）；
 * 读取：选中气泡工具条（范围激活时不弹）、App.vue 导出前清理、
 *       ChatPanel 的「替换选中」（与 selectionPlugin 的快照联动）。
 * anchor/head 都是顶层块的文档偏移，anchor ≤ head 由写入方保证（或由读取方归一）。
 */
export interface BlockRange {
  anchor: number
  head: number
}

const range = ref<BlockRange | null>(null)

/** 插件注册的「真正清除」实现（连同编辑器交易一起清，去掉 decoration）。 */
let clearImpl: (() => void) | null = null

export function setBlockRangeClearer(fn: (() => void) | null): void {
  clearImpl = fn
}

/** 插件内部写范围状态用（不触发交易）。 */
export function setBlockRange(r: BlockRange | null): void {
  range.value = r
}

/** 外部请求清除：清状态 + 走插件实现清高亮（导出前 / 源码模式等）。 */
export function clearBlockRange(): void {
  range.value = null
  clearImpl?.()
}

export function hasBlockRange(): boolean {
  return range.value !== null
}

export function useBlockRange() {
  return { range }
}

/**
 * 本次拖拽是否为「整片组拖拽」。
 * 写入：blockChromePlugin 的 dragstart（手柄命中块落在范围内时置 true）；
 * 读取：blockSelectionPlugin 的 handleDrop（据此把单块移动升级为整片移动）；
 * 清理：dragend / drop 后复位。
 */
let groupDragActive = false

export function setGroupDragActive(v: boolean): void {
  groupDragActive = v
}

export function isGroupDragActive(): boolean {
  return groupDragActive
}
