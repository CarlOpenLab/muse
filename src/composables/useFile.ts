import { ref, computed, watch, nextTick } from 'vue'
import { dispatchEditorAction } from './useEditorControl'
import { useSettings } from './useSettings'

// 渲染进程无 node:path，自备 basename（兼容 / 与 \）
function basename(p: string): string {
  const i = p.lastIndexOf('/')
  const j = p.lastIndexOf('\\')
  return p.slice(Math.max(i, j) + 1) || p
}

// ---- 标题 / 正文分离：标题为单行输入框，正文为 Milkdown 编辑器 ----
function splitTitleBody(markdown: string): { title: string; body: string } {
  const m = markdown.match(/^#\s+(.*)(?:\n|$)/)
  if (m) {
    const title = (m[1] ?? '').trim()
    const body = markdown.slice(m[0].length).replace(/^\n+/, '')
    return { title, body }
  }
  return { title: '', body: markdown }
}
function joinTitleBody(title: string, body: string): string {
  const t = title.trim() ? `# ${title.trim()}\n\n` : ''
  return t + body
}

// ---- 单例文件状态 ----
const titleText = ref('')
const doc = ref('') // 正文（不含标题）
const currentPath = ref<string | null>(null)
const dirty = ref(false)
// 是否已进入编辑（新建 / 打开 / 恢复草稿后为 true）。未进入时显示 Entry 欢迎页。
const started = ref(false)
// 程序性替换内容时置 true，抑制 watch 触发脏标记与草稿写入
let suppress = false

const filename = computed(() => (currentPath.value ? basename(currentPath.value) : '未命名'))
const title = computed(() => `${dirty.value ? '● ' : ''}${filename.value} - Muse`)
// 存盘用完整 markdown（标题 + 正文）
const fullContent = computed(() => joinTitleBody(titleText.value, doc.value))

// 草稿自动保存定时器（仅未命名文档）
let draftTimer: ReturnType<typeof setTimeout> | undefined
// 正式文件自动保存定时器（已有路径的文档）
let saveTimer: ReturnType<typeof setTimeout> | undefined
const AUTOSAVE_DELAY = 800
// 正在写盘（状态栏显示「保存中…」）
const saving = ref(false)

// 启动文档的固定路径（通过 fs:createDefault 创建的 Untitled）。
// 这类文档首次 Cmd+S 应弹“另存为”让用户自选位置，而不是静默覆盖 ~/Documents/Untitled.md
let startupPath: string | null = null
function isStartupDoc(path: string | null): boolean {
  return !!path && !!startupPath && path === startupPath
}

/** 让主进程只监听当前已打开文件；未命名草稿无需监听。 */
function syncDocumentWatch(path: string | null): void {
  void window.muse?.invoke(path ? 'fs:watchFile' : 'fs:unwatchFile', ...(path ? [path] : []))
}

/**
 * 把当前内容写回已有路径。
 * 写盘期间用户可能继续输入，故对比快照：内容已变则保留脏标记，
 * 交给下一次防抖，不会把新改动误标成「已保存」。
 */
async function writeCurrent(): Promise<void> {
  const path = currentPath.value
  if (!path) return
  const snapshot = fullContent.value
  saving.value = true
  try {
    await window.muse?.invoke('fs:save', path, snapshot)
    if (fullContent.value === snapshot) syncDirty(false)
  } finally {
    saving.value = false
  }
}

// 内容变化 -> 脏 + 防抖落盘（已命名走真实文件，未命名走草稿）
watch([doc, titleText], () => {
  if (suppress) return
  dirty.value = true
  void window.muse?.invoke('app:set-dirty', true)
  if (currentPath.value === null || isStartupDoc(currentPath.value)) {
    // 未命名 / 启动文档：防抖写草稿，不直接落到 Documents/Untitled.md，让用户通过保存自选位置
    clearTimeout(draftTimer)
    draftTimer = setTimeout(() => {
      void window.muse?.invoke('fs:writeDraft', fullContent.value)
    }, 1500)
  } else {
    // 已命名文档：自动保存（Typora / Obsidian 式），切文件与关窗前另有兜底 flush
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void writeCurrent(), AUTOSAVE_DELAY)
  }
})

/** 立即写掉防抖中的改动（切文件 / 关窗前调用） */
async function flushPending(): Promise<void> {
  clearTimeout(saveTimer)
  clearTimeout(draftTimer)
  if (!dirty.value) return
  if (currentPath.value && !isStartupDoc(currentPath.value)) await writeCurrent()
  else await window.muse?.invoke('fs:writeDraft', fullContent.value)
}

function syncDirty(v: boolean): void {
  dirty.value = v
  void window.muse?.invoke('app:set-dirty', v)
}

/** 载入新内容（打开/新建/恢复草稿），重置路径与脏标记 */
function loadContent(path: string | null, content: string): void {
  suppress = true
  clearTimeout(draftTimer)
  clearTimeout(saveTimer)
  const { title, body } = splitTitleBody(content)
  titleText.value = title
  doc.value = body
  currentPath.value = path
  syncDocumentWatch(path)
  syncDirty(false)
  started.value = true
  void nextTick(() => {
    suppress = false
  })
}

type ConfirmResult = 'save' | 'discard' | 'cancel'

/** 当前若有未保存更改，弹确认框；返回是否可继续（新建/打开） */
async function confirmDiscard(): Promise<boolean> {
  if (!dirty.value) return true
  const r = (await window.muse?.invoke('dialog:confirm-unsaved', filename.value)) as ConfirmResult
  if (r === 'cancel') return false
  if (r === 'save') return await save()
  return true // discard
}

/**
 * 切换文档前的收尾：已有路径的文档静默落盘（不打断），
 * 只有「未命名且有改动」才弹确认框——那种情况下没有可写回的路径。
 * 返回是否可以继续切换。
 */
async function flushBeforeSwitch(): Promise<boolean> {
  if (!dirty.value) return true
  if (currentPath.value && !isStartupDoc(currentPath.value)) {
    clearTimeout(saveTimer)
    await writeCurrent()
    return true
  }
  return confirmDiscard()
}

async function newFile(): Promise<void> {
  if (!(await flushBeforeSwitch())) return
  void window.muse?.invoke('fs:clearDraft')
  // Typora 式：直接落盘到可配置的固定文件（默认 ~/Documents/Untitled.md），始终同一文件
  try {
    const { settings } = useSettings()
    const dir = settings.value.defaultFileDir?.trim() || ''
    const name = settings.value.defaultFileName?.trim() || 'Untitled.md'
    const res = (await window.muse?.invoke('fs:createDefault', dir, name)) as { path: string; content: string } | null
    if (res && res.path) {
      loadContent(res.path, res.content)
      // 已有实质内容的启动文件视为普通文件（直接覆盖保存）；空文件才需“保存即另存为”
      startupPath = isDraftEmpty(res.content) ? res.path : null
      return
    }
  } catch {}
  // 回退：内存稿（极少数权限异常）
  startupPath = null
  suppress = true
  titleText.value = ''
  doc.value = ''
  currentPath.value = null
  syncDocumentWatch(null)
  syncDirty(false)
  started.value = true
  clearTimeout(draftTimer)
  clearTimeout(saveTimer)
  void nextTick(() => {
    suppress = false
  })
}

async function open(): Promise<void> {
  if (!(await flushBeforeSwitch())) return
  const r = (await window.muse?.invoke('fs:open')) as { path: string; content: string } | null
  if (r) {
    startupPath = null
    loadContent(r.path, r.content)
  }
}

async function openPath(path: string): Promise<void> {
  if (path === currentPath.value) return // 点当前文件不重载，避免打断编辑
  if (!(await flushBeforeSwitch())) return
  const r = (await window.muse?.invoke('fs:openPath', path)) as { path: string; content: string } | null
  if (r) {
    startupPath = null
    loadContent(r.path, r.content)
  }
}

// 保存互斥 + 节流：彻底根治 5 连弹对话框
// - saveLock：并发调用共享同一个 Promise（5 连发只弹 1 次）
// - lastSaveAt：800ms 内二次触发直接丢弃（长按 Cmd+S / 菜单重复）
let saveLock: Promise<boolean> | null = null
let lastSaveAt = 0
const SAVE_THROTTLE = 1500
async function save(): Promise<boolean> {
  const now = Date.now()
  if (now - lastSaveAt < SAVE_THROTTLE) return false
  if (saveLock) return saveLock
  // 启动文档：保存即另存为，让用户选择落盘位置
  if (currentPath.value && isStartupDoc(currentPath.value)) {
    return saveAs()
  }
  if (currentPath.value) {
    const p = (async () => {
      lastSaveAt = Date.now()
      clearTimeout(saveTimer)
      await writeCurrent()
      void window.muse?.invoke('fs:clearDraft')
      return true
    })()
    saveLock = p
    try { return await p } finally { saveLock = null }
  }
  return saveAs()
}

async function saveAs(): Promise<boolean> {
  const now = Date.now()
  if (now - lastSaveAt < SAVE_THROTTLE) return false
  if (saveLock) return saveLock
  const p = (async () => {
    lastSaveAt = Date.now()
    const path = (await window.muse?.invoke('fs:saveAs', fullContent.value)) as string | null
    if (path) {
      currentPath.value = path
      startupPath = null
      syncDocumentWatch(path)
      syncDirty(false)
      void window.muse?.invoke('fs:clearDraft')
      return true
    }
    return false
  })()
  saveLock = p
  try { return await p } finally { saveLock = null }
}

/** 文件在外部被重命名后同步路径（内容未变，不重载） */
function setPath(path: string): void {
  currentPath.value = path
  // 重命名后不再视为启动文档（已有了明确落盘位置）
  startupPath = null
  syncDocumentWatch(path)
}

/** 关掉当前文档，回到欢迎页（当前文件被删除时用） */
function closeDoc(): void {
  suppress = true
  clearTimeout(draftTimer)
  clearTimeout(saveTimer)
  startupPath = null
  titleText.value = ''
  doc.value = ''
  currentPath.value = null
  syncDocumentWatch(null)
  syncDirty(false)
  started.value = false
  void nextTick(() => {
    suppress = false
  })
}

/** main 触发的关闭请求：已命名非启动文档直接落盘关闭；启动文档/未命名有改动才确认 */
async function handleCloseRequest(): Promise<void> {
  if (currentPath.value && !isStartupDoc(currentPath.value)) {
    await flushPending()
    void window.muse?.invoke('app:close')
    return
  }
  if (!dirty.value) {
    void window.muse?.invoke('app:close')
    return
  }
  const r = (await window.muse?.invoke('dialog:confirm-unsaved', filename.value)) as ConfirmResult
  if (r === 'cancel') return
  if (r === 'save') {
    if (!(await save())) return // 保存被取消（另存为未选路径）
  }
  void window.muse?.invoke('app:close')
}

/** 草稿是否实质为空：去掉 markdown 结构符号与空白后无可读文本 */
function isDraftEmpty(content: string): boolean {
  const text = content
    .replace(/#{1,6}\s*/g, '') // 标题标记
    .replace(/[*_>`~\-]/g, '') // 强调/引用/列表/分隔线符号
    .replace(/\s+/g, '')
  return text.length === 0
}

/** 启动时尝试恢复未命名草稿；有则载入并返回 true */
async function restoreDraft(): Promise<boolean> {
  const d = (await window.muse?.invoke('fs:readDraft')) as { content: string } | null
  // 空草稿（如仅标题位 `# ` / 空行）视为无草稿：首次进入应停在欢迎页（empty 状态）
  if (d && d.content && !isDraftEmpty(d.content)) {
    loadContent(null, d.content)
    return true
  }
  return false
}

// 外部编辑器改写（或原子替换）当前文件后，读取磁盘的最新内容。
// 若用户正有本地未保存输入，绝不直接覆盖，以免造成数据丢失；其余情况下自动同步。
let externalReloadTimer: ReturnType<typeof setTimeout> | undefined
window.muse?.on('fs:document-changed', (path: unknown) => {
  if (typeof path !== 'string' || path !== currentPath.value) return
  clearTimeout(externalReloadTimer)
  externalReloadTimer = setTimeout(() => {
    void (async () => {
      if (path !== currentPath.value || dirty.value) return
      const r = (await window.muse?.invoke('fs:readFile', path)) as { path: string; content: string } | null
      // 读取期间可能切换了文件或开始输入，需再次确认才可替换正文。
      if (path !== currentPath.value || dirty.value) return
      if (!r) {
        closeDoc()
      } else if (r.content !== fullContent.value) {
        loadContent(path, r.content)
      }
    })()
  }, 120)
})

export function useFile() {
  return {
    doc,
    titleText,
    fullContent,
    currentPath,
    dirty,
    saving,
    started,
    filename,
    title,
    loadContent,
    newFile,
    open,
    openPath,
    save,
    saveAs,
    setPath,
    closeDoc,
    flushPending,
    flushBeforeSwitch,
    handleCloseRequest,
    restoreDraft
  }
}
