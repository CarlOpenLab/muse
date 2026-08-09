import { app, BrowserWindow, shell, Menu, type MenuItemConstructorOptions } from 'electron'
import { basename, join } from 'node:path'
import { registerFileService, setRebuildMenu, isDirty, shouldForceClose, resetForceClose, getRecent } from './services/fs'

const isDev = !app.isPackaged

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
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    title: 'Muse',
    icon: isDev ? join(__dirname, '../../resources/icon.png') : undefined,
    backgroundColor: '#ffffff',
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
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
