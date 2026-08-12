import { ref, computed, watch, nextTick } from 'vue'
import { dispatchEditorAction } from './useEditorControl'

// 渲染进程无 node:path，自备 basename（兼容 / 与 \）
function basename(p: string): string {
  const i = p.lastIndexOf('/')
  const j = p.lastIndexOf('\\')
  return p.slice(Math.max(i, j) + 1) || p
}

// ---- 单例文件状态 ----
const doc = ref('')
const currentPath = ref<string | null>(null)
const dirty = ref(false)
// 是否已进入编辑（新建 / 打开 / 恢复草稿后为 true）。未进入时显示 Entry 欢迎页。
const started = ref(false)
// 程序性替换内容时置 true，抑制 watch 触发脏标记与草稿写入
let suppress = false

const filename = computed(() => (currentPath.value ? basename(currentPath.value) : '未命名'))
const title = computed(() => `${dirty.value ? '● ' : ''}${filename.value} - Muse`)

// 草稿自动保存定时器（仅未命名文档）
let draftTimer: ReturnType<typeof setTimeout> | undefined
// 正式文件自动保存定时器（已有路径的文档）
let saveTimer: ReturnType<typeof setTimeout> | undefined
const AUTOSAVE_DELAY = 800
// 正在写盘（状态栏显示「保存中…」）
const saving = ref(false)

/**
 * 把当前内容写回已有路径。
 * 写盘期间用户可能继续输入，故对比快照：内容已变则保留脏标记，
 * 交给下一次防抖，不会把新改动误标成「已保存」。
 */
async function writeCurrent(): Promise<void> {
  const path = currentPath.value
  if (!path) return
  const snapshot = doc.value
  saving.value = true
  try {
    await window.muse?.invoke('fs:save', path, snapshot)
    if (doc.value === snapshot) syncDirty(false)
  } finally {
    saving.value = false
  }
}

// 内容变化 -> 脏 + 防抖落盘（已命名走真实文件，未命名走草稿）
watch(doc, () => {
  if (suppress) return
  dirty.value = true
  void window.muse?.invoke('app:set-dirty', true)
  if (currentPath.value === null) {
    // 未命名文档：防抖写草稿，避免每键一次 IO
    clearTimeout(draftTimer)
    draftTimer = setTimeout(() => {
      void window.muse?.invoke('fs:writeDraft', doc.value)
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
  if (currentPath.value) await writeCurrent()
  else await window.muse?.invoke('fs:writeDraft', doc.value)
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
  doc.value = content
  currentPath.value = path
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
  if (currentPath.value) {
    clearTimeout(saveTimer)
    await writeCurrent()
    return true
  }
  return confirmDiscard()
}

async function newFile(): Promise<void> {
  if (!(await flushBeforeSwitch())) return
  // 新建后清掉旧草稿，避免下次启动恢复到已废弃内容
  void window.muse?.invoke('fs:clearDraft')
  // 初始内容为一个空 H1（标题位）：placeholderPlugin 会在其上显示「无标题」占位；
  // focus-after-title 动作会在标题后补一个空段落并聚焦其起始，让用户从「标题下一行」落笔。
  loadContent(null, '# \n')
  dispatchEditorAction('focus-after-title')
}

async function open(): Promise<void> {
  if (!(await flushBeforeSwitch())) return
  const r = (await window.muse?.invoke('fs:open')) as { path: string; content: string } | null
  if (r) loadContent(r.path, r.content)
}

async function openPath(path: string): Promise<void> {
  if (path === currentPath.value) return // 点当前文件不重载，避免打断编辑
  if (!(await flushBeforeSwitch())) return
  const r = (await window.muse?.invoke('fs:openPath', path)) as { path: string; content: string } | null
  if (r) loadContent(r.path, r.content)
}

/** 保存：有路径直接存，无路径走另存为。返回是否成功 */
async function save(): Promise<boolean> {
  if (currentPath.value) {
    clearTimeout(saveTimer) // 手动保存后作废排队中的自动保存
    await writeCurrent()
    void window.muse?.invoke('fs:clearDraft') // 已落盘，清草稿
    return true
  }
  return saveAs()
}

async function saveAs(): Promise<boolean> {
  const p = (await window.muse?.invoke('fs:saveAs', doc.value)) as string | null
  if (p) {
    currentPath.value = p
    syncDirty(false)
    void window.muse?.invoke('fs:clearDraft')
    return true
  }
  return false
}

/** 文件在外部被重命名后同步路径（内容未变，不重载） */
function setPath(path: string): void {
  currentPath.value = path
}

/** 关掉当前文档，回到欢迎页（当前文件被删除时用） */
function closeDoc(): void {
  suppress = true
  clearTimeout(draftTimer)
  clearTimeout(saveTimer)
  doc.value = ''
  currentPath.value = null
  syncDirty(false)
  started.value = false
  void nextTick(() => {
    suppress = false
  })
}

/** main 触发的关闭请求：已命名文档直接落盘关闭；未命名有改动才确认 */
async function handleCloseRequest(): Promise<void> {
  if (currentPath.value) {
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

export function useFile() {
  return {
    doc,
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
