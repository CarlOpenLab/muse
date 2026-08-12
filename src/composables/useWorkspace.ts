import { ref, computed } from 'vue'

/**
 * 工作区（左侧文件栏的数据源）。
 *
 * 与 useFile 一样是模块级单例：状态提在模块作用域，多处调用共享同一份。
 * 主进程负责遍历目录（fs:listTree）与写操作，这里只做状态、持久化与刷新调度。
 */

export interface TreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: TreeNode[]
}

interface Persisted {
  root: string | null
  expanded: string[]
  width: number
  collapsed: boolean
}

const STORAGE_KEY = 'muse:workspace:v1'
export const MIN_WIDTH = 200
export const MAX_WIDTH = 380
const DEFAULT_WIDTH = 252

function basename(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() || p
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persisted>
      return {
        root: typeof p.root === 'string' ? p.root : null,
        expanded: Array.isArray(p.expanded) ? p.expanded : [],
        width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(p.width) || DEFAULT_WIDTH)),
        collapsed: p.collapsed === true,
      }
    }
  } catch {
    /* 忽略损坏的持久化数据 */
  }
  return { root: null, expanded: [], width: DEFAULT_WIDTH, collapsed: false }
}

const saved = load()

const root = ref<string | null>(saved.root)
const tree = ref<TreeNode[]>([])
const expanded = ref<Set<string>>(new Set(saved.expanded))
const width = ref(saved.width)
/** 左栏折叠：折叠后整栏不占位，靠编辑区顶栏的按钮再展开 */
const collapsed = ref(saved.collapsed)
const loading = ref(false)

const rootName = computed(() => (root.value ? basename(root.value) : ''))

function persist(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        root: root.value,
        expanded: [...expanded.value],
        width: width.value,
        collapsed: collapsed.value,
      } satisfies Persisted)
    )
  } catch {
    /* 存储满等场景静默失败 */
  }
}

/** 重新拉取目录树；root 已不可读（被删 / 移动）则退回无工作区状态 */
async function refresh(): Promise<void> {
  if (!root.value) {
    tree.value = []
    return
  }
  loading.value = true
  try {
    const r = (await window.muse?.invoke('fs:listTree', root.value)) as TreeNode[] | null
    if (r === null) {
      root.value = null
      tree.value = []
      persist()
      return
    }
    tree.value = r
  } finally {
    loading.value = false
  }
}

async function setRoot(path: string): Promise<void> {
  root.value = path
  // 换工作区时清空展开状态：旧路径在新树里没有意义
  expanded.value = new Set()
  persist()
  await refresh()
}

/** 弹系统对话框选文件夹作为工作区；返回是否选中 */
async function pickFolder(): Promise<boolean> {
  const p = (await window.muse?.invoke('fs:pickFolder')) as string | null
  if (!p) return false
  await setRoot(p)
  return true
}

async function closeWorkspace(): Promise<void> {
  root.value = null
  tree.value = []
  expanded.value = new Set()
  persist()
  await window.muse?.invoke('fs:unwatchWorkspace')
}

function isExpanded(path: string): boolean {
  return expanded.value.has(path)
}

function toggleDir(path: string): void {
  const next = new Set(expanded.value)
  if (next.has(path)) next.delete(path)
  else next.add(path)
  expanded.value = next
  persist()
}

function expandDir(path: string): void {
  if (expanded.value.has(path)) return
  const next = new Set(expanded.value)
  next.add(path)
  expanded.value = next
  persist()
}

function setWidth(w: number): void {
  width.value = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)))
  persist()
}

function toggleCollapsed(): void {
  collapsed.value = !collapsed.value
  persist()
}

/** 在指定目录（默认工作区根）下新建 md，返回新文件路径 */
async function createFile(dir?: string): Promise<string | null> {
  const target = dir ?? root.value
  if (!target) return null
  const p = (await window.muse?.invoke('fs:createFile', target, '未命名')) as string | null
  if (p) {
    expandDir(target)
    await refresh()
  }
  return p
}

async function createFolder(dir?: string): Promise<string | null> {
  const target = dir ?? root.value
  if (!target) return null
  const p = (await window.muse?.invoke('fs:createFolder', target, '新建文件夹')) as string | null
  if (p) {
    expandDir(target)
    await refresh()
  }
  return p
}

/** 重命名，返回新路径（失败返回 null，调用方据此提示） */
async function rename(path: string, newName: string): Promise<string | null> {
  const name = newName.trim()
  if (!name || name === basename(path)) return null
  // 用户没写扩展名时补 .md，避免重命名后从树里消失
  const finalName = /\.(md|markdown|mdx)$/i.test(name) ? name : `${name}.md`
  const p = (await window.muse?.invoke('fs:rename', path, finalName)) as string | null
  if (p) {
    // 展开状态里的旧目录路径同步迁移
    if (expanded.value.has(path)) {
      const next = new Set(expanded.value)
      next.delete(path)
      next.add(p)
      expanded.value = next
      persist()
    }
    await refresh()
  }
  return p
}

/** 移入废纸篓 */
async function remove(path: string): Promise<boolean> {
  const ok = (await window.muse?.invoke('fs:trash', path)) as boolean
  if (ok) await refresh()
  return ok
}

function revealInFolder(path: string): void {
  void window.muse?.invoke('fs:revealInFolder', path)
}

// 目录被外部程序改动（在访达里增删 md 等）-> 防抖刷新
let externalTimer: ReturnType<typeof setTimeout> | undefined
window.muse?.on('fs:tree-changed', () => {
  clearTimeout(externalTimer)
  externalTimer = setTimeout(() => void refresh(), 120)
})

// 启动即拉一次（有持久化的 root 时）
void refresh()

export function useWorkspace() {
  return {
    root,
    rootName,
    tree,
    expanded,
    width,
    collapsed,
    toggleCollapsed,
    loading,
    refresh,
    setRoot,
    pickFolder,
    closeWorkspace,
    isExpanded,
    toggleDir,
    expandDir,
    setWidth,
    createFile,
    createFolder,
    rename,
    remove,
    revealInFolder,
  }
}
