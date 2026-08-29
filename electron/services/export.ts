// 导出 / 图片资产 / 网页级剪贴板服务 IPC。
// 通道：
//   fs:saveImage           把 base64 图片写到文档同目录 assets/ -> 'assets/<name>' | null
//   fs:pickAndSaveImage    弹文件框选图并拷入 assets/ -> 'assets/<name>' | null
//   app:export-pdf         渲染进程先加导出样式类，再调本通道：存 PDF -> path | null
//   app:export-html        保存独立 HTML 文件 -> path | null
//   app:webctx             网页级剪贴板（cut / copy / paste / selectAll，右键菜单用）
import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, basename, dirname, extname } from 'node:path'

const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif'])

/** 清理文件名里的非法字符 */
function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '') || 'image'
}

/** 在 assets 目录里找一个不重名的文件名 */
function uniqueName(dir: string, name: string): string {
  const ext = extname(name)
  const stem = basename(name, ext)
  let candidate = name
  let i = 1
  while (existsSync(join(dir, candidate))) candidate = `${stem}-${i++}${ext}`
  return candidate
}

/** 确保文档同目录 assets/ 存在并返回其路径 */
function assetsDir(docPath: string): string {
  const dir = join(dirname(docPath), 'assets')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** 把 base64 图片写入 assets，返回可写进 markdown 的相对路径 */
function writeImage(docPath: string, fileName: string, base64: string): string | null {
  try {
    const name = uniqueName(assetsDir(docPath), sanitize(fileName))
    writeFileSync(join(assetsDir(docPath), name), Buffer.from(base64, 'base64'))
    // markdown 里空格等字符需转义，路径含中文无需转义（Typora 同样直书）
    return `assets/${encodeURI(name)}`
  } catch {
    return null
  }
}

export function registerExportService(): void {
  ipcMain.handle('fs:saveImage', (_e, docPath: string, fileName: string, base64: string) => {
    if (!docPath || !base64) return null
    return writeImage(docPath, fileName, base64)
  })

  ipcMain.handle('fs:pickAndSaveImage', async (e, docPath: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const r = await dialog.showOpenDialog(win!, {
      title: '插入图片',
      properties: ['openFile'],
      filters: [
        { name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'] },
      ],
    })
    const src = r.filePaths[0]
    if (!src || !docPath) return null
    if (!IMG_EXT.has(extname(src).toLowerCase())) return null
    try {
      const name = uniqueName(assetsDir(docPath), sanitize(basename(src)))
      writeFileSync(join(assetsDir(docPath), name), readFileSync(src))
      return `assets/${encodeURI(name)}`
    } catch {
      return null
    }
  })

  ipcMain.handle('app:export-pdf', async (e, suggestedName: string) => {
    const wc = e.sender
    const win = BrowserWindow.fromWebContents(wc)
    const r = await dialog.showSaveDialog(win!, {
      title: '导出 PDF',
      defaultPath: suggestedName.replace(/\.md$/i, '') + '.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (r.canceled || !r.filePath) return null
    const buf = await wc.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
    })
    writeFileSync(r.filePath, buf)
    return r.filePath
  })

  ipcMain.handle('app:export-html', async (e, html: string, suggestedName: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const r = await dialog.showSaveDialog(win!, {
      title: '导出 HTML',
      defaultPath: suggestedName.replace(/\.md$/i, '') + '.html',
      filters: [{ name: 'HTML', extensions: ['html'] }],
    })
    if (r.canceled || !r.filePath) return null
    writeFileSync(r.filePath, html, 'utf-8')
    return r.filePath
  })

  ipcMain.handle('app:webctx', (_e, op: string) => {
    const wc = BrowserWindow.getAllWindows()[0]?.webContents
    if (!wc) return
    if (op === 'cut') wc.cut()
    else if (op === 'copy') wc.copy()
    else if (op === 'paste') wc.paste()
    else if (op === 'selectAll') wc.selectAll()
  })
}
