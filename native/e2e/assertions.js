// Muse · e2e 断言脚本（由 native/e2e.go 在 MUSE_E2E=1 时经 Window.Eval 注入）。
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

    // ============================================================
    // 10) 块悬浮手柄 + 块操作菜单（Notion 式，阶段一）
    // ============================================================
    const topBlocks = () => [...pm().children]
    const editorScroll = () => pm().closest('.editor-scroll')
    const midY = (el) => {
      const r = el.getBoundingClientRect()
      return r.top + r.height / 2
    }
    const ensureVisible = (el) => {
      const sc = editorScroll()
      if (!sc) return
      const sr = sc.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      if (r.top < sr.top + 32) sc.scrollTop -= sr.top + 32 - r.top
      else if (r.bottom > sr.bottom - 32) sc.scrollTop += r.bottom - sr.bottom + 32
    }
    // gutter 桥监听 .editor-scroll 的 pointermove，且要求 x 在正文左缘之外
    const gutterX = () => Math.max(2, pm().getBoundingClientRect().left - 24)
    const hoverBlockAt = async (el) => {
      ensureVisible(el)
      const sc = editorScroll()
      if (!sc || !el) return
      sc.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          clientX: gutterX(),
          clientY: midY(el),
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true
        })
      )
      await sleep(420) // 官方服务 lodash.throttle(200ms) + floating-ui 定位
    }
    const handleEl = () => document.querySelector('.muse-block-handle')
    const menuEl = () => document.querySelector('.muse-block-menu')
    const handleBtns = () => [...document.querySelectorAll('.muse-block-handle .muse-block-handle-btn')]
    const menuItems = () => [...document.querySelectorAll('.muse-block-menu-item')]
    const menuClick = (label) => {
      const btn = menuItems().find((b) => b.textContent.includes(label))
      if (!btn) return false
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      return true
    }
    const openBlockMenu = async (el) => {
      await hoverBlockAt(el)
      const btn = handleBtns()[1]
      if (!btn) return false
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      await sleep(220)
      return !!menuEl()
    }
    // 追加一个受控顶层段落（末尾的顶层 P 之后插入，内容唯一便于定位）
    const appendParagraph = async (text) => {
      const ps = topBlocks().filter((el) => el.tagName === 'P')
      const lastP = ps[ps.length - 1]
      if (!lastP) return null
      pm().focus()
      caretEnd(lastP)
      await sleep(220)
      if (lastP.textContent.trim()) {
        document.execCommand('insertText', false, '\n')
        await sleep(240)
      }
      document.execCommand('insertText', false, text)
      await sleep(280)
      return (
        topBlocks()
          .filter((el) => el.tagName === 'P' && el.textContent.includes(text))
          .pop() ?? null
      )
    }
    const findTarget = () =>
      topBlocks()
        .filter((el) => el.tagName === 'P' && el.textContent.includes('notion target'))
        .pop() ?? null

    const nt = await appendParagraph('notion target')
    results.blockTargetTyped = !!nt
    if (nt) {
      await hoverBlockAt(nt)
      const h = handleEl()
      results.blockHandleShows = !!h && h.dataset.show === 'true' && getComputedStyle(h).display !== 'none'
      const opened = await openBlockMenu(nt)
      const m = menuEl()
      results.blockMenuOpens = opened && !!m && !!m.querySelector('.muse-block-menu-group')
      results.blockMenuHasOps =
        !!m &&
        ['创建副本', '复制 Markdown', '删除'].every((t) =>
          menuItems().some((b) => b.textContent.includes(t))
        )
      // 遮罩点击 → 只关菜单，不动文档
      const backdrop = document.querySelector('.fixed.inset-0.z-40')
      if (backdrop) backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      await sleep(220)
      results.blockMenuCancels = !menuEl()
      // 创建副本 → 块数 +1
      const n0 = topBlocks().length
      const dupClicked = (await openBlockMenu(findTarget())) && menuClick('创建副本')
      await sleep(380)
      results.blockMenuDuplicates = dupClicked && topBlocks().length === n0 + 1
      // 删除副本 → 回到原值
      const delClicked = (await openBlockMenu(findTarget())) && menuClick('删除')
      await sleep(380)
      results.blockMenuDeletes = delClicked && topBlocks().length === n0
      // 转换为二级标题 → 再转回正文
      const toH2 = (await openBlockMenu(findTarget())) && menuClick('二级标题')
      await sleep(420)
      results.blockMenuConverts = toH2 && !!pm().querySelector('h2')
      const h2 = pm().querySelector('h2')
      const backToP = h2 ? (await openBlockMenu(h2)) && menuClick('正文') : false
      await sleep(420)
      results.blockMenuConvertsBack = backToP && !pm().querySelector('h2')
    }

    // ＋：插入空段落 + 弹插入菜单；Esc 关闭；⌘Z 撤销
    const t5 = findTarget()
    if (t5) {
      const nPlus = topBlocks().length
      await hoverBlockAt(t5)
      const plusBtn = handleBtns()[0]
      if (plusBtn) {
        plusBtn.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 2 })
        )
        plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        // pointerup：解除「＋ 按下中」标记，否则手柄会拒绝后续拖拽
        plusBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }))
        await sleep(320)
        results.blockPlusInserts = topBlocks().length === nPlus + 1
        const m2 = menuEl()
        results.blockPlusInsertMenu =
          !!m2 &&
          [...m2.querySelectorAll('.muse-block-menu-group')].some((g) =>
            g.textContent.includes('插入块')
          )
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
        await sleep(220)
        results.blockMenuEscCloses = !menuEl()
        pm().dispatchEvent(
          new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
        )
        await sleep(450)
        results.blockPlusUndo = topBlocks().length === nPlus
      }
    }

    // ＋ 插入菜单里选类型：新空段落变成表格（formatAt 分支）
    const tIns = findTarget()
    if (tIns) {
      const tablesBefore = pm().querySelectorAll('table').length
      await hoverBlockAt(tIns)
      const plus2 = handleBtns()[0]
      if (plus2) {
        plus2.dispatchEvent(
          new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 3 })
        )
        plus2.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        plus2.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }))
        await sleep(320)
        const picked = menuClick('表格')
        await sleep(450)
        results.blockInsertTable =
          picked && pm().querySelectorAll('table').length === tablesBefore + 1
        // 表格块：菜单里没有「转换为」组（blockKind === 'table'）
        const tbl = [...topBlocks()].find((el) => el.tagName === 'TABLE')
        const openedTable = tbl ? await openBlockMenu(tbl) : false
        const tm = menuEl()
        results.blockTableMenuNoConvert =
          openedTable &&
          !!tm &&
          ![...tm.querySelectorAll('.muse-block-menu-group')].some((g) =>
            g.textContent.includes('转换为')
          ) &&
          menuItems().some((b) => b.textContent.includes('删除'))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
        await sleep(200)
        // 撤销插入的表格，恢复后续断言依赖的文档状态
        pm().dispatchEvent(
          new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
        )
        await sleep(450)
        results.blockInsertUndo = pm().querySelectorAll('table').length === tablesBefore
      }
    }

    // Esc 关菜单后打字 / 菜单开着直接打字：都不能把整块内容替换掉
    // （⠿ 的 mousedown 会留下 NodeSelection，菜单关闭时必须释放成文本光标）
    const et = await appendParagraph('esc target')
    results.escTargetTyped = !!et
    if (et) {
      const openedEsc = await openBlockMenu(et)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      await sleep(240)
      pm().focus()
      document.execCommand('insertText', false, 'X')
      await sleep(300)
      const et2 = [...topBlocks()]
        .filter((el) => el.tagName === 'P' && el.textContent.includes('esc target'))
        .pop()
      results.blockEscKeepsContent = openedEsc && !!et2 && et2.textContent.includes('esc target')
      if (et2) {
        const openedAgain = await openBlockMenu(et2)
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Y', bubbles: true, cancelable: true }))
        await sleep(260)
        const et3 = [...topBlocks()]
          .filter((el) => el.tagName === 'P' && el.textContent.includes('esc target'))
          .pop()
        results.blockTypingClosesMenu = openedAgain && !menuEl()
        results.blockTypingKeepsContent = !!et3 && et3.textContent.includes('esc target')
      }
    }

    // ============================================================
    // 11) 选中气泡工具条（阶段二）
    // ============================================================
    const tt = await appendParagraph('toolbar target')
    results.toolbarTargetTyped = !!tt
    if (tt) {
      let tn = null
      const walker = document.createTreeWalker(tt, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.textContent.includes('target')) tn = n
      }
      if (tn) {
        const idx = tn.textContent.indexOf('target')
        pm().focus()
        const rt = document.createRange()
        rt.setStart(tn, idx)
        rt.setEnd(tn, idx + 6)
        const sel2 = window.getSelection()
        sel2.removeAllRanges()
        sel2.addRange(rt)
        await sleep(380) // DOM 选区 → ProseMirror 选区同步
        const bar = document.querySelector('.muse-sel-toolbar')
        results.selectionToolbarShows =
          !!bar && bar.dataset.show === 'true' && getComputedStyle(bar).display !== 'none'
        const boldBtn = [...document.querySelectorAll('.muse-sel-toolbar-btn')].find(
          (b) => b.getAttribute('aria-label') === '加粗'
        )
        if (boldBtn) {
          boldBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
          boldBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
          await sleep(480)
        }
        results.selectionToolbarBold = [...pm().querySelectorAll('strong')].some(
          (s) => s.textContent === 'target'
        )
      }
    }

    // ============================================================
    // 12) 多块范围选择（阶段三）：gutter 拖选 → 删除 → 撤销
    // ============================================================
    const rg1 = await appendParagraph('range one')
    const rg2 = await appendParagraph('range two')
    const rg3 = await appendParagraph('range three')
    results.blockRangeTargetsTyped = !!(rg1 && rg2 && rg3)
    if (rg1 && rg2 && rg3) {
      const before = topBlocks().length
      ensureVisible(rg3)
      ensureVisible(rg1)
      const sc = editorScroll()
      const x = gutterX()
      // down→move→up 连发不插等待：中间留空隙会被真实鼠标的 mousemove 插队
      sc.dispatchEvent(
        new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: midY(rg1),
          button: 0,
          buttons: 1
        })
      )
      window.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: midY(rg3),
          buttons: 1
        })
      )
      window.dispatchEvent(
        new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: midY(rg3) })
      )
      await sleep(260)
      results.blockRangeSelects = pm().querySelectorAll('[data-muse-block-selected]').length === 3
      pm().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
      )
      await sleep(380)
      results.blockRangeDeletes = topBlocks().length === before - 3
      pm().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })
      )
      await sleep(480)
      results.blockRangeUndo = topBlocks().length === before
    }

    // ============================================================
    // 13) 浮层在源码模式 / 导出时隐藏（不留残影）
    // ============================================================
    // 手柄的「隐藏」是 opacity:0 + pointer-events:none（[data-show='false']）。
    // 不断言 opacity 数值：窗口未合成时 CSS transition 不推进（rAF 停摆），
    // 数值会假阴性；可交互性（pointer-events）才是真正会坏掉的东西。
    const handleVisible = () => {
      const h = handleEl()
      if (!h) return false
      const cs = getComputedStyle(h)
      return (
        h.dataset.show === 'true' &&
        cs.display !== 'none' &&
        cs.pointerEvents !== 'none' &&
        cs.visibility !== 'hidden'
      )
    }
    const toolbarVisible = () => {
      const t = document.querySelector('.muse-sel-toolbar')
      if (!t) return false
      const cs = getComputedStyle(t)
      return t.dataset.show === 'true' && cs.display !== 'none' && cs.visibility !== 'hidden'
    }
    await hoverBlockAt(findTarget())
    const shownBefore = handleVisible()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true, cancelable: true }))
    await sleep(400)
    results.overlaysHiddenInSource =
      shownBefore &&
      !!document.querySelector('.source-editor') &&
      !handleVisible() &&
      !toolbarVisible()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true, cancelable: true }))
    await sleep(400)
    results.sourceModeRestores = !document.querySelector('.source-editor') && !!pm()
    document.body.classList.add('exporting')
    await sleep(80)
    const hExp = handleEl()
    const tExp = document.querySelector('.muse-sel-toolbar')
    results.exportHidesOverlays =
      !!hExp &&
      !!tExp &&
      getComputedStyle(hExp).display === 'none' &&
      getComputedStyle(tExp).display === 'none'
    document.body.classList.remove('exporting')

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
      results.blockTargetTyped &&
      results.blockHandleShows &&
      results.blockMenuOpens &&
      results.blockMenuHasOps &&
      results.blockMenuCancels &&
      results.blockMenuDuplicates &&
      results.blockMenuDeletes &&
      results.blockMenuConverts &&
      results.blockMenuConvertsBack &&
      results.blockPlusInserts &&
      results.blockPlusInsertMenu &&
      results.blockMenuEscCloses &&
      results.blockPlusUndo &&
      results.blockInsertTable &&
      results.blockTableMenuNoConvert &&
      results.blockInsertUndo &&
      results.escTargetTyped &&
      results.blockEscKeepsContent &&
      results.blockTypingClosesMenu &&
      results.blockTypingKeepsContent &&
      results.toolbarTargetTyped &&
      results.selectionToolbarShows &&
      results.selectionToolbarBold &&
      results.blockRangeTargetsTyped &&
      results.blockRangeSelects &&
      results.blockRangeDeletes &&
      results.blockRangeUndo &&
      results.overlaysHiddenInSource &&
      results.sourceModeRestores &&
      results.exportHidesOverlays &&
      results.runtimeErrors.length === 0
    return { ok: results.ok, results }
  } catch (err) {
    return { ok: false, error: String((err && err.stack) || err) }
  }
})()
