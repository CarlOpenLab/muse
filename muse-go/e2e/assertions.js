// Muse · e2e 断言脚本（由 muse-go/e2e.go 在 MUSE_E2E=1 时经 Window.Eval 注入）。
//
// 驱动方式与旧 Electron 版 scripts/e2e-typora.mjs 相同：合成事件 + DOM 断言，
// 不引入任何测试专用接口；用户数据目录已被 Go 侧指向一次性临时目录。
// 返回 { ok, results }，由 Go 打印为 E2E_RESULT 一行 JSON。
(async () => {
  try {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const results = {}
    window.__errs = []
    window.addEventListener('error', (e) => window.__errs.push(String(e.message)))
    const pm = () => document.querySelector('.ProseMirror')
    const fmt = (action) => window.dispatchEvent(new CustomEvent('muse:format', { detail: action }))

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

    // 0) 等编辑器出现（启动自动建 Untitled；没有则点新建）
    for (let i = 0; i < 40 && !pm(); i++) await sleep(250)
    if (!pm()) {
      const newBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('新建文件'))
      if (newBtn) {
        newBtn.click()
        await sleep(1500)
      }
    }
    for (let i = 0; i < 20 && !pm(); i++) await sleep(250)
    results.editorMounted = !!pm()
    if (!results.editorMounted) {
      results.runtimeErrors = window.__errs
      return { ok: false, results }
    }

    // 0.5) IPC 桥冒烟：只读调用，验证 window.muse → Go 服务链路
    try {
      results.bridge = {
        platform: typeof window.muse?.platform === 'string' && window.muse.platform.length > 0,
        recentIsArray: Array.isArray(await window.muse.invoke('fs:readRecent')),
        openPathsIsArray: Array.isArray(await window.muse.invoke('app:get-open-paths'))
      }
    } catch (err) {
      results.bridge = { error: String(err) }
    }

    // 1) 输入文本 → 标题命令（heading-1）
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
    document.execCommand('insertText', false, '\n')
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

    // 5) 行内公式：$a^2+b^2=c^2$ 打字即时渲染
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
      cell.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + 5,
          clientY: rect.top + 5
        })
      )
      await sleep(400)
      const menu = document.querySelector('.ctx-menu')
      results.contextMenuOpens = !!menu
      results.contextMenuHasTableOps = !!menu && [...menu.querySelectorAll('button')].some((b) => b.textContent.includes('删除行'))
      const backdrop = document.querySelector('.fixed.inset-0.z-40')
      if (backdrop) backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
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
    // 尝试 A：折叠光标在段首
    if (pTop) {
      pm().focus()
      caretAt(pTop, 0)
      await sleep(250)
      fmt('bullet-list')
      await sleep(350)
      results.bulletListWorks = !!pm().querySelector('ul li')
    }
    // 尝试 B（兜底）：整段选中再试 —— WKWebView 下窗口未聚焦时 ProseMirror
    // 不同步折叠光标，但接受非折叠选区；真实使用时窗口聚焦，A 即成功
    if (pTop && !results.bulletListWorks) {
      pm().focus()
      const rTop = document.createRange()
      rTop.selectNodeContents(pTop)
      sel.removeAllRanges()
      sel.addRange(rTop)
      await sleep(250)
      fmt('bullet-list')
      await sleep(350)
      results.bulletListWorks = !!pm().querySelector('ul li')
    }
    const pQuote = [...pm().children].filter((el) => el.tagName === 'P').pop()
    if (pQuote) {
      pm().focus()
      caretEnd(pQuote)
      await sleep(250)
    }
    fmt('quote')
    await sleep(300)
    results.quoteWorks = !!pm().querySelector('blockquote')

    results.runtimeErrors = window.__errs
    results.ok =
      results.editorMounted &&
      results.bridge.platform &&
      results.bridge.recentIsArray &&
      results.bridge.openPathsIsArray &&
      results.headingWorks &&
      results.headingToggleBack &&
      results.boldWorks &&
      results.mathBlockInserted &&
      results.mathEditorAutoOpened &&
      results.katexRendered &&
      results.mathInlineWorks &&
      results.tableInserted &&
      results.contextMenuOpens &&
      results.contextMenuHasTableOps &&
      results.tableRowOpWorks &&
      results.sourceModeOpens &&
      results.sourceModeHasTitle &&
      results.sourceModeCloses &&
      results.bulletListWorks &&
      results.quoteWorks &&
      results.runtimeErrors.length === 0
    return { ok: results.ok, results }
  } catch (err) {
    return { ok: false, error: String((err && err.stack) || err) }
  }
})()
