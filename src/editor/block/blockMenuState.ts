import { ref } from 'vue'

/**
 * 块菜单状态（模块级单例）。
 *
 * 写入：blockChromePlugin（打开/关闭、执行菜单项）；
 * 读取：BlockMenu.vue（渲染菜单）。
 * 菜单项被点击时不再回调插件实例，而是调用注册进来的 executor —— 这样
 * 菜单组件与插件生命周期解耦（插件销毁时置 null）。
 */
export type BlockMenuMode = 'action' | 'insert'

export interface BlockMenuAnchor {
  left: number
  top: number
  bottom: number
}

export interface BlockMenuState {
  open: boolean
  /** action：⠿ 菜单（转换为 + 操作）；insert：＋ 插入后的类型菜单 */
  mode: BlockMenuMode
  anchor: BlockMenuAnchor | null
  /** 目标顶层块的文档偏移 */
  offset: number
  /** insert 模式：新插入空段落的光标位置 */
  caretPos: number
  /** 目标块类型名（table 时隐藏「转换为」组） */
  blockKind: string
}

const EMPTY: BlockMenuState = {
  open: false,
  mode: 'action',
  anchor: null,
  offset: -1,
  caretPos: -1,
  blockKind: '',
}

const menu = ref<BlockMenuState>({ ...EMPTY })

export function openBlockMenu(init: {
  mode: BlockMenuMode
  anchor: BlockMenuAnchor
  offset: number
  caretPos?: number
  blockKind?: string
}): void {
  menu.value = {
    open: true,
    mode: init.mode,
    anchor: init.anchor,
    offset: init.offset,
    caretPos: init.caretPos ?? -1,
    blockKind: init.blockKind ?? '',
  }
}

export function closeBlockMenu(): void {
  menu.value = { ...EMPTY }
}

export type BlockMenuExecutor = (id: string, state: BlockMenuState) => void

let executor: BlockMenuExecutor | null = null

/** 插件构造时注册真实执行体；销毁时置 null。 */
export function setBlockMenuExecutor(fn: BlockMenuExecutor | null): void {
  executor = fn
}

/** 菜单项点击入口：执行后由执行体自行决定关不关（当前一律关）。 */
export function invokeBlockMenu(id: string): void {
  const s = menu.value
  if (!s.open || !executor) return
  executor(id, s)
}

export function useBlockMenu() {
  return { menu }
}
