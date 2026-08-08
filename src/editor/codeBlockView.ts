import { $view } from '@milkdown/utils'
import { codeBlockSchema } from '@milkdown/preset-commonmark'
import type { NodeView } from '@milkdown/prose/view'
import type { Node as PMNode } from '@milkdown/prose/model'
import { LANGUAGE_OPTIONS, normalizeLang } from './shiki/highlighter'

/**
 * code_block 自定义 NodeView：右上角放语言下拉 + 复制 / 删除按钮。
 *
 * 结构：`<div.code-block><div.code-lang-bar><button/><button/><button/></div><pre><code/></pre></div>`
 * - contentDOM 仍是 `<code>`，ProseMirror 管文本、Shiki inline decoration 照常上色；
 * - 工具条用 `<div>` 包裹（absolute, contentEditable=false），不随 `<pre>` 横向滚动；
 * - 语言「下拉」是自定义浮层（非原生 select）：点触发按钮弹出带搜索框的可滚动列表，
 *   支持键盘 ↑/↓/Enter/Esc；浮层 position:fixed 挂到 body，不被 overflow:hidden 裁切；
 * - 复制按钮：把当前代码写进剪贴板，短暂切到 ✓ 反馈；
 * - 删除按钮：删掉整个 code_block 节点；
 * - `stopEvent` 拦截工具条上的事件，避免影响代码内容与编辑器选区；
 * - `ignoreMutation` 仅忽略工具条子树，contentDOM 文本变化照常交给 ProseMirror。
 */

// lucide 风格的内联 SVG（stroke=currentColor，随主题变色）
const COPY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'
const CHECK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
const TRASH_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>'
const CHEVRON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'

type LangOption = { label: string; value: string }

export const codeBlockView = $view(codeBlockSchema.node, () => (node, view, getPos) => {
  const dom = document.createElement('div')
  dom.classList.add('code-block')

  const bar = document.createElement('div')
  bar.className = 'code-lang-bar'
  bar.contentEditable = 'false'

  let current: PMNode = node

  // ============ 语言下拉（自定义浮层） ============
  const trigger = document.createElement('button')
  trigger.className = 'code-lang-trigger'
  trigger.type = 'button'
  trigger.setAttribute('aria-haspopup', 'listbox')
  trigger.setAttribute('aria-label', '代码语言')

  const labelEl = document.createElement('span')
  labelEl.className = 'code-lang-label'
  const chevronEl = document.createElement('span')
  chevronEl.className = 'code-lang-chevron'
  chevronEl.innerHTML = CHEVRON_SVG
  trigger.append(labelEl, chevronEl)

  // 当前 language 归一化后不在选项表里时，补一个临时选项，保证可见可选
  function ensureExtraOption(): LangOption | undefined {
    const lang = String(current.attrs.language ?? '')
    const norm = normalizeLang(lang)
    if (!norm) return undefined
    if (LANGUAGE_OPTIONS.some((o) => o.value === norm)) return undefined
    return { label: lang, value: norm }
  }

  function allOptions(): LangOption[] {
    const extra = ensureExtraOption()
    return extra ? [extra, ...LANGUAGE_OPTIONS] : LANGUAGE_OPTIONS
  }

  /** 触发按钮上显示的文案。 */
  function triggerLabel(): string {
    const lang = String(current.attrs.language ?? '')
    const norm = normalizeLang(lang)
    const hit = LANGUAGE_OPTIONS.find((o) => o.value === norm)
    if (hit) return hit.label
    return lang || '纯文本'
  }

  function syncTrigger(): void {
    labelEl.textContent = triggerLabel()
  }

  // ---- 浮层状态 ----
  let popover: HTMLElement | null = null
  let searchInput: HTMLInputElement | null = null
  let listEl: HTMLElement | null = null
  let filtered: LangOption[] = []
  let highlight = -1

  function positionPopover(): void {
    if (!popover || !trigger) return
    const rect = trigger.getBoundingClientRect()
    const popH = popover.offsetHeight
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = popH + 6 > spaceBelow && rect.top > spaceBelow
    popover.style.left = `${rect.left}px`
    if (openUp) {
      popover.style.top = `${Math.max(6, rect.top - popH - 6)}px`
    } else {
      popover.style.top = `${rect.bottom + 4}px`
    }
    popover.classList.toggle('flip-up', openUp)
  }

  function renderList(): void {
    if (!listEl) return
    listEl.innerHTML = ''
    filtered.forEach((opt, i) => {
      const item = document.createElement('div')
      item.className = 'code-lang-option'
      item.textContent = opt.label
      item.setAttribute('role', 'option')
      if (i === highlight) item.classList.add('active')
      item.addEventListener('mousedown', (e) => {
        e.preventDefault() // 不让 search 失焦
        choose(opt)
      })
      listEl!.appendChild(item)
    })
  }

  function applyFilter(q: string): void {
    const query = q.trim().toLowerCase()
    filtered = allOptions().filter(
      (o) => !query || o.label.toLowerCase().includes(query) || o.value.toLowerCase().includes(query),
    )
    highlight = filtered.length ? 0 : -1
    renderList()
  }

  function moveHighlight(delta: number): void {
    if (!filtered.length) return
    highlight = (highlight + delta + filtered.length) % filtered.length
    renderList()
    // 把高亮项滚进视口
    const items = listEl?.children
    if (items && items[highlight]) {
      ;(items[highlight] as HTMLElement).scrollIntoView({ block: 'nearest' })
    }
  }

  function choose(opt: LangOption): void {
    const pos = getPos()
    closePopover()
    if (typeof pos !== 'number') return
    view.dispatch(view.state.tr.setNodeAttribute(pos, 'language', opt.value))
    view.focus()
  }

  function closePopover(): void {
    if (!popover) return
    popover.remove()
    popover = null
    searchInput = null
    listEl = null
    filtered = []
    highlight = -1
    trigger.removeAttribute('aria-expanded')
    trigger.classList.remove('open')
    window.removeEventListener('mousedown', onOutsideMouseDown, true)
    window.removeEventListener('scroll', onScrollOrResize, true)
    window.removeEventListener('resize', onScrollOrResize)
  }

  function onOutsideMouseDown(e: MouseEvent): void {
    const t = e.target
    if (t instanceof Node && popover?.contains(t)) return
    if (t instanceof Node && trigger.contains(t)) return // 触发按钮自己处理 toggle
    closePopover()
  }

  function onScrollOrResize(e: Event): void {
    // 滚动浮层内部列表不关闭；其余滚动（编辑器滚动、页面滚动）/ 窗口缩放才关
    if (e.type === 'scroll') {
      const t = e.target
      if (t instanceof Node && popover?.contains(t)) return
    }
    closePopover()
  }

  function openPopover(): void {
    if (popover) return
    popover = document.createElement('div')
    popover.className = 'code-lang-popover'

    searchInput = document.createElement('input')
    searchInput.className = 'code-lang-search'
    searchInput.type = 'text'
    searchInput.placeholder = '搜索语言…'
    searchInput.spellcheck = false
    searchInput.setAttribute('aria-label', '搜索语言')
    searchInput.addEventListener('input', () => applyFilter(searchInput!.value))
    searchInput.addEventListener('keydown', (e) => {
      e.stopPropagation()
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          moveHighlight(1)
          break
        case 'ArrowUp':
          e.preventDefault()
          moveHighlight(-1)
          break
        case 'Enter':
          e.preventDefault()
          if (filtered[highlight]) choose(filtered[highlight])
          break
        case 'Escape':
          e.preventDefault()
          closePopover()
          view.focus()
          break
        case 'Tab':
          e.preventDefault()
          break
      }
    })

    listEl = document.createElement('div')
    listEl.className = 'code-lang-list'
    listEl.setAttribute('role', 'listbox')

    popover.append(searchInput, listEl)
    document.body.appendChild(popover)

    trigger.classList.add('open')
    trigger.setAttribute('aria-expanded', 'true')

    applyFilter('')
    positionPopover()
    searchInput.focus()

    window.addEventListener('mousedown', onOutsideMouseDown, true)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
  }

  trigger.addEventListener('click', () => {
    if (popover) closePopover()
    else openPopover()
  })
  trigger.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      openPopover()
    }
  })
  bar.appendChild(trigger)
  syncTrigger()

  // ============ 复制按钮 ============
  const copyBtn = document.createElement('button')
  copyBtn.className = 'code-action-btn'
  copyBtn.type = 'button'
  copyBtn.title = '复制代码'
  copyBtn.setAttribute('aria-label', '复制代码')
  copyBtn.innerHTML = COPY_SVG
  let copyTimer: number | undefined
  copyBtn.addEventListener('click', () => {
    const text = current.textContent
    const done = () => {
      copyBtn.innerHTML = CHECK_SVG
      copyBtn.classList.add('copied')
      window.clearTimeout(copyTimer)
      copyTimer = window.setTimeout(() => {
        copyBtn.innerHTML = COPY_SVG
        copyBtn.classList.remove('copied')
      }, 1200)
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(done)
    } else {
      // 兜底：临时 textarea
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* 忽略 */
      }
      document.body.removeChild(ta)
      done()
    }
  })
  bar.appendChild(copyBtn)

  // ============ 删除按钮 ============
  const delBtn = document.createElement('button')
  delBtn.className = 'code-action-btn danger'
  delBtn.type = 'button'
  delBtn.title = '删除代码块'
  delBtn.setAttribute('aria-label', '删除代码块')
  delBtn.innerHTML = TRASH_SVG
  delBtn.addEventListener('click', () => {
    closePopover()
    const pos = getPos()
    if (typeof pos !== 'number') return
    view.dispatch(view.state.tr.delete(pos, pos + current.nodeSize))
    view.focus()
  })
  bar.appendChild(delBtn)

  const pre = document.createElement('pre')
  const codeDOM = document.createElement('code')
  pre.appendChild(codeDOM)
  dom.appendChild(bar)
  dom.appendChild(pre)

  return {
    dom,
    contentDOM: codeDOM,
    update(updated) {
      if (updated.type !== current.type) return false
      current = updated
      syncTrigger()
      // 浮层打开时也跟着同步高亮（一般不会发生，稳妥起见）
      if (popover) {
        const q = searchInput?.value ?? ''
        applyFilter(q)
        positionPopover()
      }
      return true
    },
    ignoreMutation(record) {
      // 仅忽略工具条子树的 mutation；contentDOM 文本变化必须交给 ProseMirror
      return bar.contains(record.target)
    },
    stopEvent(event) {
      // 工具条上的事件不冒泡到编辑器（否则点击控件会移动 ProseMirror 选区）
      const target = event.target
      return target instanceof Node && bar.contains(target)
    },
    destroy() {
      window.clearTimeout(copyTimer)
      closePopover()
    },
  } satisfies NodeView
})
