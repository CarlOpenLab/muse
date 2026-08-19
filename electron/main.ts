import { app, BrowserWindow, shell, Menu, ipcMain, type MenuItemConstructorOptions } from 'electron'
import { statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { registerFileService, setRebuildMenu, isDirty, shouldForceClose, resetForceClose, getRecent } from './services/fs'
import { registerAiService } from './services/ai'

// 关键：覆盖 Electron 默认的 app 名称，否则 macOS Dock hover 会显示 "Electron"
// 必须在 app ready 之前设置，dev 模式下尤其生效（打包后由 Info.plist 的 CFBundleDisplayName 决定）
app.setName('Muse')

const isDev = !app.isPackaged

// 项目 logo（resources/icon.png，1024px 透明底）
// - dev：用于 macOS Dock 图标（BrowserWindow 的 icon 在 mac 上不生效）
// - 打包后：由 electron-builder 的 icon.icns / icon.png 配置提供
const APP_ICON = join(__dirname, '../../resources/icon.png')

// ---- macOS：文件/文件夹拖到 Dock 图标（或 Finder「打开方式」） ----
// open-file 由 AppleEvent 驱动，必须在 app ready 之前挂监听，才能收到
// 「应用尚未启动时拖入」的路径。收到后先暂存，等渲染进程就绪（通过
// app:get-open-paths 握手）一次性派发；运行中拖入则直接推给当前窗口。
interface OpenPathItem {
  path: string
  isDir: boolean
}
let pendingOpenPaths: string[] = []
let rendererReady = false

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** 取走并清空暂存路径，附上「是否目录」标记 */
function takeOpenPaths(): OpenPathItem[] {
  const items = pendingOpenPaths.map((p) => ({ path: p, isDir: isDirectory(p) }))
  pendingOpenPaths = []
  return items
}

function flushOpenPaths(): void {
  if (!rendererReady || !pendingOpenPaths.length) return
  const win = BrowserWindow.getAllWindows()[0]
  if (win) win.webContents.send('app:open-paths', takeOpenPaths())
}

app.on('open-file', (e, path) => {
  e.preventDefault()
  pendingOpenPaths.push(path)
  flushOpenPaths()
})

// 渲染进程启动握手：先注册事件监听再 invoke，保证事件推送与启动拉取互不丢失
ipcMain.handle('app:get-open-paths', () => {
  rendererReady = true
  return takeOpenPaths()
})

function buildMenu(win: BrowserWindow): void {
  const recent = getRecent()
  const recentSub: MenuItemConstructorOptions[] = recent.length
    ? recent.map((p) => ({
        label: basename(p),
        sublabel: p,
        click: () => win.webContents.send('menu:action', { action: 'open-recent', path: p })
      }))
    : [{ label: '无最近文件', enabled: false }]

  const send = (action: string): void => {
    win.webContents.send('menu:action', { action })
  }

  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    {
      label: '文件',
      submenu: [
        { label: '新建', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: '打开…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { type: 'separator' },
        { label: '最近打开', submenu: recentSub },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { label: '查找…', accelerator: 'CmdOrCtrl+F', click: () => send('find') },
        { label: '替换…', accelerator: 'CmdOrCtrl+Alt+F', click: () => send('find') },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    title: 'Muse',
    icon: isDev ? APP_ICON : undefined,
    backgroundColor: '#ffffff',
    // macOS：隐藏标题栏、红绿灯浮在内容上（落进左侧文件栏顶部的拖拽条里）。
    // Windows / Linux 保持系统边框——自绘最小化/最大化/关闭按钮不在本次范围内。
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 15 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // 外链交给系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // dev：把渲染进程 console 转发到主进程终端
  if (isDev) {
    win.webContents.on('console-message', (_e, ...args: unknown[]) => {
      const first = args[0]
      let level: number
      let message: string
      if (first && typeof first === 'object') {
        level = (first as { level?: number }).level ?? 1
        message = (first as { message?: string }).message ?? ''
      } else {
        level = typeof first === 'number' ? first : 1
        message = typeof args[1] === 'string' ? args[1] : ''
      }
      const tag = ['verbose', 'info', 'warn', 'error'][level] ?? 'log'
      console.log(`[renderer:${tag}]`, message)
    })
  }

  // 关闭：脏则拦截，交渲染进程确认；强制关闭（确认后）放行
  win.on('close', (e) => {
    if (shouldForceClose()) {
      resetForceClose()
      return
    }
    if (isDirty()) {
      e.preventDefault()
      win.webContents.send('app:request-close')
    }
  })

  buildMenu(win)
  setRebuildMenu(() => buildMenu(win))

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerFileService()
  registerAiService()
  // dev 模式下把 Dock 图标换成项目 logo（打包后由 .icns 提供）
  if (isDev && process.platform === 'darwin') {
    app.dock?.setIcon(APP_ICON)
  }
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
