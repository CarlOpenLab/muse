/**
 * Typora 对齐功能 e2e 冒烟测试：加载真实构建产物，
 * 用窗口事件 / 合成键盘事件驱动「格式化命令 / 数学公式 / 表格 / 右键菜单 / 源代码模式」，
 * 断言 DOM 结果。用法：先 npm run build，再 node scripts/e2e-typora.mjs
 */
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electron = require('electron')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const js = `
(async () => {
  try {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const log = []
  const results = {}
  window.__errs = []
  window.addEventListener('error', (e) => window.__errs.push(String(e.message)))
  // 把光标放到元素/文本节点的真实末尾
  const caretEnd = (el) => {
    const r = document.createRange()
    const tn = el.lastChild
    if (tn && tn.nodeType === 3) r.setStart(tn, tn.textContent.length)
    else r.setStart(el, el.childNodes.length)
    r.collapse(true)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
  }
  const caretAt = (el, offset) => {
    const r = document.createRange()
    r.setStart(el, offset)
    r.collapse(true)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
  }

  const fmt = (action) => window.dispatchEvent(new CustomEvent('muse:format', { detail: action }))
  const pm = () => document.querySelector('.ProseMirror')

  // 0) 等编辑器出现（启动已自动建 Untitled.md；没有则点新建）
  for (let i = 0; i < 40 && !pm(); i++) await sleep(250)
  if (!pm()) {
    const newBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('新建文件'))
    if (newBtn) { newBtn.click(); await sleep(1500) }
  }
  for (let i = 0; i < 20 && !pm(); i++) await sleep(250)
  results.editorMounted = !!pm()
  if (!results.editorMounted) return { ok: false, log, results }

  // 1) 输入文本 → 标题命令 ⌘1 路径（heading-1）
  pm().focus()
  document.execCommand('insertText', false, 'hello typora')
  await sleep(300)
  const p0 = pm().querySelector('p')
  const sel = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(p0)
  sel.removeAllRanges()
  sel.addRange(range)
  fmt('heading-1')
  await sleep(300)
  results.headingWorks = !!pm().querySelector('h1') && pm().querySelector('h1').textContent.includes('hello typora')

  // 2) 同级再切换 → 退回正文
  fmt('heading-1')
  await sleep(300)
  results.headingToggleBack = !pm().querySelector('h1') && !!pm().querySelector('p')

  // 3) 加粗（选中文字 → bold）
  const p1 = pm().querySelector('p')
  pm().focus()
  const r2 = document.createRange()
  r2.setStart(p1.firstChild, 0)
  r2.setEnd(p1.firstChild, 5)
  sel.removeAllRanges()
  sel.addRange(r2)
  await sleep(250) // DOM 选区 → ProseMirror 选区同步是异步的
  fmt('bold')
  await sleep(300)
  results.boldWorks = !!pm().querySelector('strong')
  // 收起选区到段落末尾（保留 'hello typora' 完整文本）
  const p1b = pm().querySelector('p')
  pm().focus()
  caretEnd(p1b)
  await sleep(250)

  // 4) 数学块：插入空块 → 自动进入编辑态 → 输入公式 → blur 渲染 katex
  document.execCommand('insertText', false, '\\n')
  await sleep(200)
  fmt('math-block')
  await sleep(400)
  const block = pm().querySelector('div[data-type="math_block"]')
  results.mathBlockInserted = !!block
  const editorEl = block && block.querySelector('.muse-math-editor')
  results.mathEditorAutoOpened = !!editorEl
  if (editorEl) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(editorEl, 'E=mc^2')
    editorEl.dispatchEvent(new Event('input', { bubbles: true }))
    editorEl.dispatchEvent(new Event('blur'))
    await sleep(400)
  }
  results.katexRendered = !!pm().querySelector('div[data-type="math_block"] .katex')

  // 5) 行内公式输入规则：$a^2+b^2=c^2$ 打字即时渲染
  //    显式把光标放进正文段落末尾（上一步 NodeSelection 可能停在公式块上）
  const lastP = [...pm().querySelectorAll('p')].filter((p) => p.textContent.includes('hello') || p.textContent.trim())
  const target = lastP[lastP.length - 1] || pm().querySelector('p')
  pm().focus()
  caretEnd(target)
  await sleep(250)
  document.execCommand('insertText', false, ' $a^2+b^2=c^2$')
  await sleep(400)
  results.mathInlineWorks = !!pm().querySelector('span[data-type="math_inline"] .katex')

  // 6) 表格：插入 → 右键菜单 → 行列操作
  fmt('table')
  await sleep(400)
  const table = pm().querySelector('table')
  results.tableInserted = !!table
  const rows0 = table ? table.querySelectorAll('tr').length : 0
  const cell = table && table.querySelector('td, th')
  if (cell) {
    const rect = cell.getBoundingClientRect()
    cell.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, clientX: rect.left + 5, clientY: rect.top + 5
    }))
    await sleep(400)
    const menu = document.querySelector('.ctx-menu')
    results.contextMenuOpens = !!menu
    results.contextMenuHasTableOps = !!menu && [...menu.querySelectorAll('button')].some((b) => b.textContent.includes('删除行'))
    // 关闭菜单（点遮罩）
    const backdrop = document.querySelector('.fixed.inset-0.z-40')
    backdrop && backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await sleep(200)
    fmt('table-row-below')
    await sleep(400)
    const rows1 = pm().querySelector('table').querySelectorAll('tr').length
    results.tableRowOpWorks = rows1 > rows0
    // 往第一个数据格打字，验证空单元格 / 有字单元格的序列化
    const c1 = pm().querySelector('table td')
    if (c1) {
      pm().focus()
      caretEnd(c1.querySelector('p') || c1)
      await sleep(250)
      document.execCommand('insertText', false, 'A1')
      await sleep(300)
    }
  }

  // 7) 源代码模式 ⌘/
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true, cancelable: true }))
  await sleep(300)
  const srcArea = document.querySelector('.source-editor')
  results.sourceModeOpens = !!srcArea
  results.sourceSnippet = srcArea ? srcArea.value.slice(0, 120) : ''
  results.sourceModeHasTitle = !!srcArea && /typora/.test(srcArea.value)
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true, cancelable: true }))
  await sleep(300)
  results.sourceModeCloses = !document.querySelector('.source-editor')

  // 8) 专注模式装饰（F8）
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', bubbles: true, cancelable: true }))
  await sleep(300)
  results.focusModeDeco = !!document.querySelector('.focus-mode') && !!document.querySelector('.muse-dim')
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', bubbles: true, cancelable: true }))
  await sleep(200)

  // 9) 列表 / 引用（选顶层段落，避免选到表格单元格里的 p）
  const pTop = [...pm().children].find((el) => el.tagName === 'P')
  if (pTop) {
    pm().focus()
    caretAt(pTop, 0)
    await sleep(250)
    fmt('bullet-list')
    await sleep(300)
  }
  results.bulletListWorks = !!pm().querySelector('ul li')
  // 光标放进顶层段落（表格后的数学段落），引用包住该段落
  const pQuote = [...pm().children].filter((el) => el.tagName === 'P').pop()
  if (pQuote) {
    pm().focus()
    caretEnd(pQuote)
    await sleep(250)
  }
  fmt('quote')
  await sleep(300)
  results.quoteWorks = !!pm().querySelector('blockquote')
  results.quoteSnippet = pm().innerHTML.slice(0, 220)

  // 10) 文件树侧栏：底部按钮打开文件夹 → 树渲染 → 打开文件 → 展开 → 重命名 → 删除
  results.treeSteps = {}
  const tree = {}
  try {
    // 10.1 底部工具条按钮展开侧栏（空态：有「打开文件夹…」引导）
    const filesBtn = document.querySelector('button[aria-label="文件栏"]')
    filesBtn && filesBtn.click()
    await sleep(400)
    tree.sidebarOpens = !!document.querySelector('.tree-open-btn') // 空态里有「打开文件夹…」
    // 10.2 底部「打开文件夹」按钮：选目录 + 展开文件树（harness 返回夹具目录）
    const openFolderBtn = document.querySelector('button[aria-label="打开文件夹"]')
    tree.openFolderBtnExists = !!openFolderBtn
    openFolderBtn && openFolderBtn.click()
    await sleep(900)
    const rowTexts = () => [...document.querySelectorAll('.tree-row .flex-1')].map((e) => e.textContent || '')
    tree.listRendered = rowTexts().some((t) => t.includes('笔记A.md')) && rowTexts().some((t) => t.includes('子目录'))
    // 10.3 点击文件打开
    const rowA = [...document.querySelectorAll('.tree-row')].find((el) => (el.querySelector('.flex-1')?.textContent || '').includes('笔记A.md'))
    rowA && rowA.click()
    await sleep(800)
    const titleInput = document.querySelector('.title-input')
    tree.openFileWorks = !!titleInput && titleInput.value === '笔记A' && (pm()?.textContent || '').includes('AAA 内容')
    // 10.4 展开目录 → 打开嵌套文件
    const rowDir = [...document.querySelectorAll('.tree-row')].find((el) => (el.querySelector('.flex-1')?.textContent || '').includes('子目录'))
    rowDir && rowDir.click()
    await sleep(400)
    const rowN = [...document.querySelectorAll('.tree-row')].find((el) => (el.querySelector('.flex-1')?.textContent || '').includes('嵌套.md'))
    rowN && rowN.click()
    await sleep(800)
    tree.nestedOpenWorks = (document.querySelector('.title-input')?.value === '嵌套') && (pm()?.textContent || '').includes('NNN')
    // 10.5 右键重命名 笔记B → 笔记C
    window.confirm = () => true
    const rowB = [...document.querySelectorAll('.tree-row')].find((el) => (el.querySelector('.flex-1')?.textContent || '').includes('笔记B.md'))
    rowB && rowB.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    await sleep(300)
    const renameItem = [...document.querySelectorAll('.ctx-menu .ctx-menu-item')].find((b) => b.textContent.includes('重命名'))
    renameItem && renameItem.click()
    await sleep(300)
    const renameInputEl = document.querySelector('.tree-row input')
    if (renameInputEl) {
      const tvSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      tvSetter.call(renameInputEl, '笔记C.md')
      renameInputEl.dispatchEvent(new Event('input', { bubbles: true }))
      renameInputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await sleep(600)
    }
    tree.renameWorks = rowTexts().some((t) => t.includes('笔记C.md')) && !rowTexts().some((t) => t.includes('笔记B.md'))
    // 10.6 右键删除 笔记C（confirm 已被覆盖为 true）
    const rowC = [...document.querySelectorAll('.tree-row')].find((el) => (el.querySelector('.flex-1')?.textContent || '').includes('笔记C.md'))
    rowC && rowC.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    await sleep(300)
    const trashItem = [...document.querySelectorAll('.ctx-menu .ctx-menu-item')].find((b) => b.textContent.includes('废纸篓'))
    trashItem && trashItem.click()
    await sleep(600)
    tree.deleteWorks = !rowTexts().some((t) => t.includes('笔记C.md'))
    // 10.7 新建文件（头部按钮 → 根目录出现新文件）
    const newFileBtn = document.querySelector('.tree-icon-btn[title="新建文件"]')
    newFileBtn && newFileBtn.click()
    await sleep(700)
    tree.createFileWorks = rowTexts().some((t) => t.includes('未命名'))
  } catch (err) {
    tree.err = String((err && err.stack) || err)
  }
  results.treeSteps = tree

  results.runtimeErrors = window.__errs
  results.ok = results.headingWorks && results.headingToggleBack && results.boldWorks &&
    results.mathBlockInserted && results.mathEditorAutoOpened && results.katexRendered &&
    results.mathInlineWorks && results.tableInserted && results.contextMenuOpens &&
    results.contextMenuHasTableOps && results.tableRowOpWorks && results.sourceModeOpens &&
    results.sourceModeHasTitle && results.sourceModeCloses && results.bulletListWorks && results.quoteWorks &&
    tree.sidebarOpens && tree.openFolderBtnExists && tree.listRendered && tree.openFileWorks && tree.nestedOpenWorks &&
    tree.renameWorks && tree.deleteWorks && tree.createFileWorks
  return { ok: results.ok, log, results }
  } catch (err) {
    return { ok: false, error: String((err && err.stack) || err), results }
  }
})()
`

const mainScript = join(root, 'scripts', '.e2e-typora-main.cjs')
const fs = await import('node:fs')
fs.writeFileSync(
  mainScript,
  `
const { app, BrowserWindow, Menu, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

// 一次性 userData：localStorage 每次运行都从零开始，避免上次的工作区状态泄漏
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'muse-e2e-ud-')))

app.whenReady().then(async () => {
  try {
    await run()
  } catch (e) {
    console.error(e)
    app.exit(1)
  }
})

async function run() {
  // ---- 最小 fs IPC 夹具：临时目录模拟工作区，让文件树全链路可测 ----
  const FIXTURE = fs.mkdtempSync(path.join(os.tmpdir(), 'muse-fixture-'))
  fs.writeFileSync(path.join(FIXTURE, '笔记A.md'), '# 笔记A\\n\\nAAA 内容', 'utf-8')
  fs.writeFileSync(path.join(FIXTURE, '笔记B.md'), '# 笔记B\\n\\nBBB', 'utf-8')
  fs.mkdirSync(path.join(FIXTURE, '子目录'))
  fs.writeFileSync(path.join(FIXTURE, '子目录', '嵌套.md'), '# 嵌套\\n\\nNNN', 'utf-8')

  const walk = (dir, depth) => {
    if (depth > 4) return []
    const out = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        const children = walk(full, depth + 1)
        if (children.length) out.push({ name: e.name, path: full, type: 'dir', children })
      } else if (/\\.(md|markdown|mdx)$/i.test(e.name)) {
        out.push({ name: e.name, path: full, type: 'file' })
      }
    }
    return out
  }

  ipcMain.handle('app:get-open-paths', () => [])
  ipcMain.handle('fs:readRecent', () => [])
  ipcMain.handle('fs:clearDraft', () => null)
  ipcMain.handle('fs:writeDraft', () => null)
  ipcMain.handle('fs:readDraft', () => null)
  ipcMain.handle('app:set-dirty', () => null)
  ipcMain.handle('fs:watchFile', () => null)
  ipcMain.handle('fs:unwatchFile', () => null)
  ipcMain.handle('fs:unwatchWorkspace', () => null)
  ipcMain.handle('fs:revealInFolder', () => null)
  ipcMain.handle('app:webctx', () => null)
  ipcMain.handle('dialog:confirm-unsaved', () => 'discard')
  ipcMain.handle('fs:createDefault', () => {
    const dir = path.join(FIXTURE, '.startup')
    fs.mkdirSync(dir, { recursive: true })
    const p = path.join(dir, 'Untitled.md')
    fs.writeFileSync(p, '', 'utf-8')
    return { path: p, content: '' }
  })
  ipcMain.handle('fs:pickFolder', () => FIXTURE)
  ipcMain.handle('fs:listTree', (_e, root) => (fs.existsSync(root) ? walk(root, 0) : null))
  ipcMain.handle('fs:openPath', (_e, p) => ({ path: p, content: fs.readFileSync(p, 'utf-8') }))
  ipcMain.handle('fs:readFile', (_e, p) => ({ path: p, content: fs.readFileSync(p, 'utf-8') }))
  ipcMain.handle('fs:isDir', (_e, p) => fs.existsSync(p) && fs.statSync(p).isDirectory())
  ipcMain.handle('fs:createFile', (_e, dir, base = '未命名') => {
    let p = path.join(dir, base + '.md')
    let i = 2
    while (fs.existsSync(p)) p = path.join(dir, base + ' ' + i++ + '.md')
    fs.writeFileSync(p, '', 'utf-8')
    return p
  })
  ipcMain.handle('fs:createFolder', (_e, dir, base = '新建文件夹') => {
    let p = path.join(dir, base)
    let i = 2
    while (fs.existsSync(p)) p = path.join(dir, base + ' ' + i++)
    fs.mkdirSync(p)
    return p
  })
  ipcMain.handle('fs:rename', (_e, p, newName) => {
    const next = path.join(path.dirname(p), newName)
    if (fs.existsSync(next)) return null
    fs.renameSync(p, next)
    return next
  })
  ipcMain.handle('fs:trash', (_e, p) => {
    fs.rmSync(p, { recursive: true, force: true })
    return true
  })

  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    webPreferences: {
      preload: path.join(${JSON.stringify(root)}, 'out/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  await win.loadFile(path.join(${JSON.stringify(root)}, 'out/renderer/index.html'))
  await new Promise((r) => setTimeout(r, 4500))
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) console.log('[renderer]', message, '@', source, line)
  })
  const menuTitles = (Menu.getApplicationMenu() ? Menu.getApplicationMenu().items.map((i) => i.label) : [])
  let result
  try {
    result = await win.webContents.executeJavaScript(${JSON.stringify(js)})
  } catch (err) {
    console.error('EXECJS_ERROR:', err && err.message)
  }
  console.log('MENU_ITEMS:', JSON.stringify(menuTitles))
  console.log('RESULT:', JSON.stringify(result, null, 2))
  app.exit(result && result.ok ? 0 : 1)
}
`
)

const { spawn } = await import('node:child_process')
const child = spawn(electron, [mainScript], { stdio: ['ignore', 'inherit', 'inherit'] })
const exitCode = await new Promise((resolve) => child.on('exit', resolve))
// process.exit 不会触发 finally，直接清理
fs.rmSync(mainScript, { force: true })
process.exit(exitCode ?? 1)
