// 文件服务 IPC 处理器 + 应用级状态（dirty / 最近文件 / 工作区 / 强制关闭）。
// 通道：
//   fs:open          弹选择框打开 -> { path, content } | null
//   fs:openPath      按路径打开（拖拽 / 最近文件）-> { path, content } | null
//   fs:save          保存到指定路径 -> path
//   fs:saveAs        弹另存为框 -> path | null
//   fs:readRecent    读取最近文件列表 -> string[]
//   fs:pickFolder    弹选择框选工作区目录 -> path | null
//   fs:listTree      递归列出工作区里的 markdown -> TreeNode[] | null
//   fs:createFile    在目录下新建 md（重名自动加序号）-> path | null
//   fs:rename        重命名文件 / 目录 -> newPath | null
//   fs:trash         移入废纸篓（可恢复）-> boolean
//   fs:watchWorkspace / fs:unwatchWorkspace  目录监听 -> 变更时推 'fs:tree-changed'
//   fs:watchFile / fs:unwatchFile             当前文档监听 -> 变更时推 'fs:document-changed'
//   fs:readFile                               按路径读取（供外部变更后的无副作用重载）
//   fs:revealInFolder 在系统文件管理器中显示
//   app:set-dirty   渲染进程同步脏标记（main 关窗时用）
//   app:close        渲染进程确认后请求强制关闭
//   dialog:confirm-unsaved  未保存确认框 -> 'save' | 'discard' | 'cancel'
import { ipcMain, dialog, app, shell, BrowserWindow, type WebContents } from 'electron'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  unlinkSync,
  readdirSync,
  mkdirSync,
  renameSync,
  watch,
  type FSWatcher
} from 'node:fs'
import { join, basename, dirname, resolve, extname, sep } from 'node:path'

// ---- 模块状态 ----
let dirty = false
let recent: string[] = []
let forceClose = false
let rebuildMenu: (() => void) | null = null

const recentFile = join(app.getPath('userData'), 'recent.json')
const draftFile = join(app.getPath('userData'), 'draft.json')

// ---- 最近文件持久化 ----
function loadRecent(): void {
  try {
    recent = existsSync(recentFile) ? JSON.parse(readFileSync(recentFile, 'utf-8')) : []
    if (!Array.isArray(recent)) recent = []
  } catch {
    recent = []
  }
}

function saveRecent(): void {
  try {
    writeFileSync(recentFile, JSON.stringify(recent))
  } catch {
    /* ignore */
  }
}

function addRecent(path: string): void {
  recent = [path, ...recent.filter((p) => p !== path)].slice(0, 12)
  saveRecent()
  rebuildMenu?.()
}

// ---- 给 main.ts 用的访问器 ----
export function setRebuildMenu(fn: () => void): void {
  rebuildMenu = fn
}
export function isDirty(): boolean {
  return dirty
}
export function getRecent(): string[] {
  return [...recent]
}
export function shouldForceClose(): boolean {
  return forceClose
}
export function resetForceClose(): void {
  forceClose = false
}

// ---- 工作区：目录树 + 文件操作 ----
export interface TreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
  children?: TreeNode[]
}

const MD_EXT = new Set(['.md', '.markdown', '.mdx'])
// 可直接在 Muse 中打开的文本文件扩展名（用于「打开文件」的校验：拒绝 doc / pdf 等二进制）
const TEXT_EXT = new Set(['.md', '.markdown', '.mdx', '.txt'])
const SKIP_DIR = new Set(['node_modules', 'dist', 'out', 'build', '.git'])
const MAX_DEPTH = 8
const MAX_ENTRIES = 5000

// 当前工作区根目录：写类操作（新建 / 重命名 / 删除）只允许作用于它之下
let workspaceRoot: string | null = null
let watcher: FSWatcher | null = null
let watchTimer: ReturnType<typeof setTimeout> | undefined

/**
 * 每个渲染窗口只监听它当前打开的那一份文档。监听父目录而非文件本身，
 * 因为 VS Code 等程序常以「写临时文件后 rename 替换」的方式保存，文件级
 * watcher 会在替换后失效。
 */
interface DocumentWatcher {
  path: string
  watcher: FSWatcher
  timer?: ReturnType<typeof setTimeout>
}
const documentWatchers = new Map<number, DocumentWatcher>()

/** 目标是否位于工作区之内（防止渲染层传来越界路径） */
function insideWorkspace(target: string): boolean {
  if (!workspaceRoot) return false
  const root = resolve(workspaceRoot)
  const p = resolve(target)
  return p === root || p.startsWith(root + sep)
}

/**
 * 递归收集 markdown 文件树。
 * 目录在前、同级按名称排序；跳过隐藏目录与依赖/产物目录；
 * 不含任何 markdown 的目录会被剪掉，避免左栏出现一堆空文件夹。
 */
function walk(dir: string, depth: number, budget: { n: number }): TreeNode[] {
  if (depth > MAX_DEPTH || budget.n >= MAX_ENTRIES) return []
  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return [] // 无权限 / 已被删除
  }

  const dirs: TreeNode[] = []
  const files: TreeNode[] = []
  for (const e of entries) {
    if (budget.n >= MAX_ENTRIES) break
    if (e.name.startsWith('.') || SKIP_DIR.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      const children = walk(full, depth + 1, budget)
      if (!children.length) continue // 空目录（无 md）不展示
      budget.n++
      dirs.push({ name: e.name, path: full, type: 'dir', children })
    } else if (e.isFile() && MD_EXT.has(extname(e.name).toLowerCase())) {
      budget.n++
      files.push({ name: e.name, path: full, type: 'file' })
    }
  }

  const byName = (a: TreeNode, b: TreeNode): number => a.name.localeCompare(b.name, 'zh-CN')
  return [...dirs.sort(byName), ...files.sort(byName)]
}

/** 在 dir 下找一个未被占用的文件名：未命名.md / 未命名 2.md / … */
function uniquePath(dir: string, base: string, ext: string): string {
  let p = join(dir, `${base}${ext}`)
  let i = 2
  while (existsSync(p)) {
    p = join(dir, `${base} ${i}${ext}`)
    i++
  }
  return p
}

/** 目录变更 -> 防抖后通知渲染层刷新树 */
function notifyTreeChanged(): void {
  clearTimeout(watchTimer)
  watchTimer = setTimeout(() => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send('fs:tree-changed')
  }, 300)
}

function stopWatch(): void {
  watcher?.close()
  watcher = null
  clearTimeout(watchTimer)
}

function stopDocumentWatch(senderId: number): void {
  const active = documentWatchers.get(senderId)
  if (!active) return
  active.watcher.close()
  clearTimeout(active.timer)
  documentWatchers.delete(senderId)
}

function startDocumentWatch(sender: WebContents, path: string): void {
  stopDocumentWatch(sender.id)
  const target = resolve(path)
  const parent = dirname(target)
  try {
    const fileWatcher = watch(parent, { persistent: false }, (_event, changed) => {
      // filename 缺失时宁可通知一次，让渲染层重新读取并确认；否则只关心当前文件。
      if (changed && resolve(parent, changed.toString()) !== target) return
      const active = documentWatchers.get(sender.id)
      if (!active || active.path !== target) return
      clearTimeout(active.timer)
      active.timer = setTimeout(() => {
        // 窗口销毁后不能再向它发 IPC 消息。
        if (!sender.isDestroyed()) sender.send('fs:document-changed', target)
      }, 180)
    })
    documentWatchers.set(sender.id, { path: target, watcher: fileWatcher })
    sender.once('destroyed', () => stopDocumentWatch(sender.id))
  } catch {
    // 目录被移除或没有权限时不抛给渲染层；下一次打开会重新尝试监听。
  }
}

function startWatch(root: string): void {
  stopWatch()
  try {
    // recursive 在 macOS / Windows 原生支持；Linux（Node 20+）亦已支持，失败则静默降级为不监听
    watcher = watch(root, { recursive: true }, notifyTreeChanged)
  } catch {
    watcher = null
  }
}

app.on('before-quit', () => {
  stopWatch()
  for (const senderId of documentWatchers.keys()) stopDocumentWatch(senderId)
})

function readPath(path: string): { path: string; content: string } | null {
  try {
    const content = readFileSync(path, 'utf-8')
    addRecent(path)
    return { path, content }
  } catch {
    return null
  }
}

/** 是否允许在 Muse 中打开：仅限文本类文件（Markdown / .txt）。doc / pdf 等二进制一律拒绝。 */
function isTextFile(path: string): boolean {
  return TEXT_EXT.has(extname(path).toLowerCase())
}

/** 选了非文本文件（doc / pdf 等）时，弹一个温和的提示。 */
async function warnUnsupported(win: BrowserWindow | null, path: string): Promise<void> {
  const target = win ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!target) return
  await dialog.showMessageBox(target, {
    type: 'warning',
    message: `无法打开「${basename(path)}」`,
    detail: 'Muse 只能打开文本类文件（Markdown 或 .txt）。请选择 .md / .markdown / .mdx / .txt 文件。',
    buttons: ['知道了'],
    defaultId: 0,
    noLink: true
  })
}

export function registerFileService(): void {
  loadRecent()

  ipcMain.handle('fs:open', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = win
      ? await dialog.showOpenDialog(win, {
          title: '打开 Markdown',
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx', 'txt'] }],
          properties: ['openFile']
        })
      : await dialog.showOpenDialog({
          title: '打开 Markdown',
          filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx', 'txt'] }],
          properties: ['openFile']
        })
    if (res.canceled || !res.filePaths.length) return null
    const filePath = res.filePaths[0]
    // 拒绝 doc / pdf 等非文本文件：弹窗提示且不打开
    if (!isTextFile(filePath)) {
      await warnUnsupported(win, filePath)
      return null
    }
    return readPath(filePath)
  })

  ipcMain.handle('fs:openPath', (_e, path: string) => {
    // 拖拽 / 最近文件 / 外部「打开方式」落到路径打开时，同样只接受文本类文件
    if (!isTextFile(path)) return null
    return readPath(path)
  })

  // 外部程序改写当前文档后使用：不更新最近文件，也不触发打开流程。
  ipcMain.handle('fs:readFile', (_e, path: string) => {
    try {
      return { path, content: readFileSync(path, 'utf-8') }
    } catch {
      return null
    }
  })

  ipcMain.handle('fs:watchFile', (e, path: string) => {
    if (typeof path === 'string' && path) startDocumentWatch(e.sender, path)
  })

  ipcMain.handle('fs:unwatchFile', (e) => stopDocumentWatch(e.sender.id))

  // 判断路径是否为目录（窗口内拖入文件夹时区分「工作区」与「文档」）
  ipcMain.handle('fs:isDir', (_e, path: string) => {
    try {
      return statSync(path).isDirectory()
    } catch {
      return false
    }
  })

  ipcMain.handle('fs:save', (_e, path: string, content: string) => {
    writeFileSync(path, content, 'utf-8')
    addRecent(path)
    return path
  })

  ipcMain.handle('fs:saveAs', async (_e, content: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const opts = {
      title: '保存 Markdown',
      defaultPath: 'Untitled.md',
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] }]
    }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return null
    writeFileSync(res.filePath, content, 'utf-8')
    addRecent(res.filePath)
    return res.filePath
  })

  ipcMain.handle('fs:readRecent', () => getRecent())

  // ---- 工作区 ----
  ipcMain.handle('fs:pickFolder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const opts = {
      title: '打开文件夹',
      buttonLabel: '打开',
      properties: ['openDirectory' as const, 'createDirectory' as const]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths.length) return null
    return res.filePaths[0]
  })

  // 列树顺带把 root 记为当前工作区（写类操作的越界校验基准）并挂上监听
  ipcMain.handle('fs:listTree', (_e, root: string) => {
    if (!root || !existsSync(root)) {
      if (workspaceRoot === root) {
        workspaceRoot = null
        stopWatch()
      }
      return null
    }
    if (workspaceRoot !== root) {
      workspaceRoot = root
      startWatch(root)
    }
    return walk(root, 0, { n: 0 })
  })

  ipcMain.handle('fs:createFile', (_e, dir: string, base = '未命名') => {
    if (!insideWorkspace(dir) || !existsSync(dir)) return null
    try {
      const p = uniquePath(dir, base, '.md')
      writeFileSync(p, '', 'utf-8')
      return p
    } catch {
      return null
    }
  })

  ipcMain.handle('fs:createFolder', (_e, dir: string, base = '新建文件夹') => {
    if (!insideWorkspace(dir) || !existsSync(dir)) return null
    try {
      let p = join(dir, base)
      let i = 2
      while (existsSync(p)) {
        p = join(dir, `${base} ${i}`)
        i++
      }
      mkdirSync(p)
      return p
    } catch {
      return null
    }
  })

  // 重命名：只接受纯文件名（不含分隔符），且新旧路径都必须在工作区内
  ipcMain.handle('fs:rename', (_e, path: string, newName: string) => {
    const name = (newName ?? '').trim()
    if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
      return null
    }
    if (!insideWorkspace(path) || !existsSync(path)) return null
    const next = join(dirname(path), name)
    if (!insideWorkspace(next) || existsSync(next)) return null
    try {
      renameSync(path, next)
      // 最近文件里的旧路径同步跟上，避免菜单里留死链接
      recent = recent.map((p) => (p === path ? next : p))
      saveRecent()
      rebuildMenu?.()
      return next
    } catch {
      return null
    }
  })

  // 删除走废纸篓而非直接 unlink：误删可恢复
  ipcMain.handle('fs:trash', async (_e, path: string) => {
    if (!insideWorkspace(path) || !existsSync(path)) return false
    try {
      await shell.trashItem(path)
      recent = recent.filter((p) => p !== path)
      saveRecent()
      rebuildMenu?.()
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('fs:revealInFolder', (_e, path: string) => {
    if (path && existsSync(path)) shell.showItemInFolder(path)
  })

  ipcMain.handle('fs:unwatchWorkspace', () => {
    workspaceRoot = null
    stopWatch()
  })

  // 未命名文档草稿：自动保存 / 启动恢复
  ipcMain.handle('fs:readDraft', () => {
    try {
      if (existsSync(draftFile)) {
        const data = JSON.parse(readFileSync(draftFile, 'utf-8'))
        if (data && typeof data.content === 'string') return { content: data.content }
      }
    } catch {
      /* ignore */
    }
    return null
  })

  ipcMain.handle('fs:writeDraft', (_e, content: string) => {
    try {
      writeFileSync(draftFile, JSON.stringify({ content, ts: Date.now() }))
    } catch {
      /* ignore */
    }
  })

  ipcMain.handle('fs:clearDraft', () => {
    try {
      if (existsSync(draftFile)) unlinkSync(draftFile)
    } catch {
      /* ignore */
    }
  })

  // 渲染进程 -> main：脏标记同步（关窗判断用）
  ipcMain.handle('app:set-dirty', (_e, v: boolean) => {
    dirty = v
  })

  // 未保存确认框
  ipcMain.handle('dialog:confirm-unsaved', async (_e, name: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const opts = {
      type: 'warning' as const,
      message: `要存储对“${name}”的更改吗？`,
      detail: '如果不存储，将丢失未保存的更改。',
      buttons: ['存储', '不存储', '取消'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    }
    const res = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
    return (['save', 'discard', 'cancel'] as const)[res.response]
  })

  // 渲染进程完成确认后请求关闭（绕过脏检查）
  ipcMain.handle('app:close', () => {
    forceClose = true
    BrowserWindow.getFocusedWindow()?.close()
  })
}
