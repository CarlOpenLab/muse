import { ref, computed, watch, nextTick } from 'vue'

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
// 程序性替换内容时置 true，抑制 watch 触发脏标记与草稿写入
let suppress = false

const filename = computed(() => (currentPath.value ? basename(currentPath.value) : '未命名'))
const title = computed(() => `${dirty.value ? '● ' : ''}${filename.value} - md-ai`)

// 草稿自动保存定时器（仅未命名文档）
let draftTimer: ReturnType<typeof setTimeout> | undefined

// 内容变化 -> 脏 + 草稿防抖写入
watch(doc, () => {
  if (suppress) return
  dirty.value = true
  void window.md?.invoke('app:set-dirty', true)
  // 未命名文档：防抖写草稿，避免每键一次 IO
  if (currentPath.value === null) {
    clearTimeout(draftTimer)
    draftTimer = setTimeout(() => {
      void window.md?.invoke('fs:writeDraft', doc.value)
    }, 1500)
  }
})

function syncDirty(v: boolean): void {
  dirty.value = v
  void window.md?.invoke('app:set-dirty', v)
}

/** 载入新内容（打开/新建/恢复草稿），重置路径与脏标记 */
function loadContent(path: string | null, content: string): void {
  suppress = true
  clearTimeout(draftTimer)
  doc.value = content
  currentPath.value = path
  syncDirty(false)
  void nextTick(() => {
    suppress = false
  })
}

type ConfirmResult = 'save' | 'discard' | 'cancel'

/** 当前若有未保存更改，弹确认框；返回是否可继续（新建/打开） */
async function confirmDiscard(): Promise<boolean> {
  if (!dirty.value) return true
  const r = (await window.md?.invoke('dialog:confirm-unsaved', filename.value)) as ConfirmResult
  if (r === 'cancel') return false
  if (r === 'save') return await save()
  return true // discard
}

async function newFile(): Promise<void> {
  if (!(await confirmDiscard())) return
  // 新建后清掉旧草稿，避免下次启动恢复到已废弃内容
  void window.md?.invoke('fs:clearDraft')
  loadContent(null, '')
}

async function open(): Promise<void> {
  if (!(await confirmDiscard())) return
  const r = (await window.md?.invoke('fs:open')) as { path: string; content: string } | null
  if (r) loadContent(r.path, r.content)
}

async function openPath(path: string): Promise<void> {
  if (!(await confirmDiscard())) return
  const r = (await window.md?.invoke('fs:openPath', path)) as { path: string; content: string } | null
  if (r) loadContent(r.path, r.content)
}

/** 保存：有路径直接存，无路径走另存为。返回是否成功 */
async function save(): Promise<boolean> {
  if (currentPath.value) {
    await window.md?.invoke('fs:save', currentPath.value, doc.value)
    syncDirty(false)
    void window.md?.invoke('fs:clearDraft') // 已落盘，清草稿
    return true
  }
  return saveAs()
}

async function saveAs(): Promise<boolean> {
  const p = (await window.md?.invoke('fs:saveAs', doc.value)) as string | null
  if (p) {
    currentPath.value = p
    syncDirty(false)
    void window.md?.invoke('fs:clearDraft')
    return true
  }
  return false
}

/** main 触发的关闭请求：脏则确认，再决定关闭或放弃 */
async function handleCloseRequest(): Promise<void> {
  if (!dirty.value) {
    void window.md?.invoke('app:close')
    return
  }
  const r = (await window.md?.invoke('dialog:confirm-unsaved', filename.value)) as ConfirmResult
  if (r === 'cancel') return
  if (r === 'save') {
    if (!(await save())) return // 保存被取消（另存为未选路径）
  }
  void window.md?.invoke('app:close')
}

/** 启动时尝试恢复未命名草稿；有则载入并返回 true */
async function restoreDraft(): Promise<boolean> {
  const d = (await window.md?.invoke('fs:readDraft')) as { content: string } | null
  if (d && d.content) {
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
    filename,
    title,
    loadContent,
    newFile,
    open,
    openPath,
    save,
    saveAs,
    handleCloseRequest,
    restoreDraft
  }
}
