// 文件服务 IPC 处理器 + 应用级状态（dirty / 最近文件 / 强制关闭）。
// 通道：
//   fs:open          弹选择框打开 -> { path, content } | null
//   fs:openPath      按路径打开（拖拽 / 最近文件）-> { path, content } | null
//   fs:save          保存到指定路径 -> path
//   fs:saveAs        弹另存为框 -> path | null
//   fs:readRecent    读取最近文件列表 -> string[]
//   app:set-dirty   渲染进程同步脏标记（main 关窗时用）
//   app:close        渲染进程确认后请求强制关闭
//   dialog:confirm-unsaved  未保存确认框 -> 'save' | 'discard' | 'cancel'
import { ipcMain, dialog, app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { join, basename } from 'node:path'

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

function readPath(path: string): { path: string; content: string } | null {
  try {
    const content = readFileSync(path, 'utf-8')
    addRecent(path)
    return { path, content }
  } catch {
    return null
  }
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
    return readPath(res.filePaths[0])
  })

  ipcMain.handle('fs:openPath', (_e, path: string) => readPath(path))

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
