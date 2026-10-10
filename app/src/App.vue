<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ConfigProvider, theme as antdTheme } from 'antdv-next'
import { ThemeProvider } from 'antdv-style'
import { XProvider } from '@antdv-next/x'
import type { XProviderProps } from '@antdv-next/x'
import MilkdownEditor from './editor/MilkdownEditor.vue'
import TitleBar from './components/TitleBar.vue'
import SidePanel from './components/SidePanel.vue'
import OutlinePanel from './components/OutlinePanel.vue'
import ChatPanel from './chat/ChatPanel.vue'
import { useTheme } from './composables/useTheme'
import { useFile } from './composables/useFile'
import { useWorkspace, type TreeNode } from './composables/useWorkspace'
import { useDocStats } from './composables/useDocStats'
import { useOutline } from './composables/useOutline'
import { useSearch } from './composables/useSearch'
import { useSettings } from './composables/useSettings'
import { useLinkModal } from './composables/useLinkModal'
import { dispatchEditorInsert, dispatchEditorReplaceSelection } from './composables/useEditorControl'
import StatusBar from './components/StatusBar.vue'
import SearchPanel from './components/SearchPanel.vue'
import SettingsModal from './components/SettingsModal.vue'
import EditorContextMenu from './components/EditorContextMenu.vue'
import LinkModal from './components/LinkModal.vue'
import SourceEditor from './components/SourceEditor.vue'
import FileTreePanel from './components/FileTreePanel.vue'
import { useViewMode, type ViewModeState } from './composables/useViewMode'
import { dispatchFormat, dispatchSelectCell, dispatchInsertImage, dispatchEditorFocusBody } from './composables/useEditorControl'
import { clearBlockRange } from './editor/block/blockSelectionState'
import type { FormatAction } from './editor/formatCommands'

const { isDark, toggle, themeId, currentTheme } = useTheme()

// antdv 主题接管：appearance 驱动 antdv-style 注入 --ant-color-* CSS 变量，
// algorithm 驱动 ConfigProvider 的暗色 token 派生。isDark 仍是明暗模式的单一真相源。
const appearance = computed(() => (isDark.value ? 'dark' : 'light'))

/** 读取当前生效的主题 CSS 变量（useTheme 的 watch 先于本 computed 应用，时序安全）。 */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// antd token：与 base.css 的语义变量同一套取色（参考稿的近黑单色体系）。
// - 亮色：白底 + 中性灰阶细线，主色近黑，主按钮黑底白字；
// - 暗色：#1a1a1a 底 + #212121 浮层 + #363637 分栏线。antd 主按钮文字 /
//   复选框勾选色硬编码为 #fff（colorTextLightSolid），故暗色主色不能用近白（白字
//   不可见），改用比底色浅一档的 #3a3a3b——主按钮浅灰底白字、勾选色可读；
//   链接等「主色文字」单独覆盖为浅灰保证可读。
const SHADCN_FONT =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
const shadcnLight = {
  colorPrimary: '#000000',
  colorSuccess: '#16a34a',
  colorWarning: '#f59e0b',
  colorError: '#ef4444',
  colorInfo: '#3b82f6',
  colorTextBase: '#1f1f21',
  colorBgBase: '#ffffff',
  colorPrimaryBg: '#f4f4f5',
  colorPrimaryBgHover: '#ececed',
  colorPrimaryBorder: '#dcdcdf',
  colorPrimaryBorderHover: '#b4b4b8',
  colorPrimaryHover: '#334155',
  colorPrimaryActive: '#1e293b',
  colorPrimaryText: '#0f172a',
  colorPrimaryTextHover: '#334155',
  colorPrimaryTextActive: '#1e293b',
  colorSuccessBg: '#f0fdf4',
  colorSuccessBgHover: '#dcfce7',
  colorSuccessBorder: '#bbf7d0',
  colorSuccessBorderHover: '#86efac',
  colorSuccessHover: '#22c55e',
  colorSuccessActive: '#15803d',
  colorSuccessText: '#16a34a',
  colorSuccessTextHover: '#22c55e',
  colorSuccessTextActive: '#15803d',
  colorWarningBg: '#fffbeb',
  colorWarningBgHover: '#fef3c7',
  colorWarningBorder: '#fde68a',
  colorWarningBorderHover: '#fcd34d',
  colorWarningHover: '#fbbf24',
  colorWarningActive: '#d97706',
  colorWarningText: '#f59e0b',
  colorWarningTextHover: '#fbbf24',
  colorWarningTextActive: '#d97706',
  colorErrorBg: '#fef2f2',
  colorErrorBgHover: '#fee2e2',
  colorErrorBorder: '#fecaca',
  colorErrorBorderHover: '#fca5a5',
  colorErrorHover: '#f87171',
  colorErrorActive: '#dc2626',
  colorErrorText: '#ef4444',
  colorErrorTextHover: '#f87171',
  colorErrorTextActive: '#dc2626',
  colorInfoBg: '#eff6ff',
  colorInfoBgHover: '#dbeafe',
  colorInfoBorder: '#bfdbfe',
  colorInfoBorderHover: '#93c5fd',
  colorInfoHover: '#60a5fa',
  colorInfoActive: '#1d4ed8',
  colorInfoText: '#3b82f6',
  colorInfoTextHover: '#60a5fa',
  colorInfoTextActive: '#1d4ed8',
  colorText: '#1f1f21',
  colorTextSecondary: '#6b6b70',
  colorTextTertiary: '#858585',
  colorTextQuaternary: 'rgba(31, 31, 33, 0.25)',
  colorTextDisabled: 'rgba(31, 31, 33, 0.25)',
  colorBgContainer: '#ffffff',
  colorBgElevated: '#ffffff',
  colorBgLayout: '#ffffff',
  colorBgSpotlight: 'rgba(31, 31, 33, 0.9)',
  colorBgMask: 'rgba(31, 31, 33, 0.4)',
  colorBorder: '#dcdcdf',
  colorBorderSecondary: '#e6e6e8',
  borderRadius: 8,
  borderRadiusXS: 4,
  borderRadiusSM: 6,
  borderRadiusLG: 12,
  padding: 16,
  paddingSM: 12,
  paddingLG: 24,
  margin: 16,
  marginSM: 12,
  marginLG: 24,
  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  boxShadowSecondary: '0 1px 4px 0 rgba(0, 0, 0, 0.08)',
  fontFamily: SHADCN_FONT,
}
const shadcnDark = {
  colorPrimary: '#3a3a3b',
  colorPrimaryHover: '#4a4a4c',
  colorPrimaryActive: '#2a2a2a',
  colorPrimaryText: '#e2e2e2',
  colorPrimaryTextHover: '#f5f5f5',
  colorPrimaryTextActive: '#c8c8c8',
  colorPrimaryBg: '#2a2a2a',
  colorPrimaryBgHover: '#333334',
  colorPrimaryBorder: '#363637',
  colorPrimaryBorderHover: '#4a4a4c',
  colorSuccess: '#4ade80',
  colorWarning: '#fbbf24',
  colorError: '#f87171',
  colorInfo: '#60a5fa',
  colorTextBase: '#e2e2e2',
  colorBgBase: '#1a1a1a',
  colorText: '#e2e2e2',
  colorTextSecondary: '#a3a3a3',
  colorTextTertiary: '#7d7d7d',
  colorTextQuaternary: 'rgba(255, 255, 255, 0.22)',
  colorTextDisabled: 'rgba(255, 255, 255, 0.22)',
  colorBgContainer: '#1a1a1a',
  colorBgElevated: '#212121',
  colorBgLayout: '#1a1a1a',
  colorBgSpotlight: '#2a2a2a',
  colorBgMask: 'rgba(0, 0, 0, 0.55)',
  colorBorder: '#363637',
  colorBorderSecondary: '#282828',
  borderRadius: 8,
  borderRadiusXS: 4,
  borderRadiusSM: 6,
  borderRadiusLG: 12,
  padding: 16,
  paddingSM: 12,
  paddingLG: 24,
  margin: 16,
  marginSM: 12,
  marginLG: 24,
  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.4)',
  boxShadowSecondary: '0 4px 12px 0 rgba(0, 0, 0, 0.45)',
  fontFamily: SHADCN_FONT,
}
// 多主题下让 antd 组件（弹窗 / 输入框 / 工具提示等）跟随当前色板：文本、背景、
// 边框直接取 base.css 的语义变量；浅色主题主色跟 --accent（都能压住 antd 硬编码
// 的白字）；深色主题保持默认灰阶主色——多主题强调色偏亮，白字主按钮不可读。
const themeConfig = computed(() => {
  // 依赖 themeId：同为深色的主题间切换时 isDark 不变，仍需重算 antd token
  // （此时 useTheme 的 watch 已先应用好 CSS 变量，读取到的值即为新色板）
  void themeId.value
  const dark = isDark.value
  const token = {
    ...(dark ? shadcnDark : shadcnLight),
    colorText: cssVar('--fg'),
    colorTextSecondary: cssVar('--fg-soft'),
    colorTextTertiary: cssVar('--fg-dim'),
    colorBgBase: cssVar('--bg'),
    colorBgContainer: cssVar('--bg'),
    colorBgLayout: cssVar('--bg'),
    colorBgElevated: cssVar('--bg-elev'),
    colorBorder: cssVar('--border-strong'),
    colorBorderSecondary: cssVar('--border'),
  }
  if (!dark) token.colorPrimary = cssVar('--accent')
  return {
    algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token,
  }
})
const {
  doc,
  titleText,
  fullContent,
  currentPath,
  dirty,
  saving,
  started,
  filename,
  title,
  newFile,
  open,
  openPath,
  save,
  saveAs,
  setPath,
  closeDoc,
  handleCloseRequest,
  restoreDraft
} = useFile()

const {
  root: workspaceRoot,
  tree: workspaceTree,
  createFile: createWorkspaceFile,
  revealInFolder,
  pickFolder,
  setRoot
} = useWorkspace()

const stats = useDocStats(fullContent)
const headings = useOutline(fullContent)
const search = useSearch()
const { settings } = useSettings()

// ===== 视图模式（Typora「视图」菜单）：源代码 / 专注 / 打字机 / 大纲 =====
const { viewMode, toggle: toggleViewMode } = useViewMode()

/** 切换视图模式并广播（打字机插件监听此事件即时对齐光标） */
function setViewMode<K extends keyof ViewModeState>(key: K, value?: ViewModeState[K]): void {
  viewMode.value[key] = value === undefined ? !viewMode.value[key] : value
  window.dispatchEvent(new CustomEvent('muse:viewmode-changed'))
}

/** 源代码模式：进入时取整篇 markdown（含标题行），输入按「首行 # 标题 + 正文」拆回 */
const sourceText = ref('')
watch(
  () => viewMode.value.source,
  (on) => {
    if (on) sourceText.value = fullContent.value
  }
)
function onSourceChange(text: string): void {
  const m = text.match(/^#\s+(.*)(?:\n|$)/)
  if (m) {
    titleText.value = (m[1] ?? '').trim()
    doc.value = text.slice(m[0].length).replace(/^\n+/, '')
  } else {
    titleText.value = ''
    doc.value = text
  }
}

function toggleSourceMode(): void {
  setViewMode('source')
}

// ===== 文件树侧栏（Typora「文件」面板）：打开文件夹 / 打开文件 / 重命名同步 =====
function toggleFilesSidebar(): void {
  setViewMode('files')
}

/** 「打开文件夹…」（菜单 ⌘⇧O / 底部工具条按钮共用）：选目录 + 设为工作区 + 展开文件树侧栏 */
async function openFolderFlow(): Promise<void> {
  const ok = await pickFolder()
  if (ok) viewMode.value.files = true
}

/** 树内重命名后，若改名的是当前文档则同步路径（沿用原监听，不重载内容） */
function onTreeRenamed(e: Event): void {
  const { oldPath, newPath } = (e as CustomEvent<{ oldPath: string; newPath: string }>).detail
  if (oldPath === currentPath.value) setPath(newPath)
}

const showSettings = ref(false)
const recentFiles = ref<string[]>([])
const titleInputRef = ref<HTMLInputElement | null>(null)
function focusTitleInput(): void {
  titleInputRef.value?.focus()
  titleInputRef.value?.select()
}
function handleTitleBarEdit(): void {
  // Typora 式：点击文件名即聚焦标题输入（标题与文件名分离，文件重命名走右键/另存为）
  focusTitleInput()
}
/** 标题输入框回车：光标切进正文开头（一行标题写完，回车即落笔正文）。 */
function onTitleEnter(e: KeyboardEvent): void {
  // 输入法组合中的回车只用于候选上屏，不算「进入正文」
  if (e.isComposing) return
  e.preventDefault()
  dispatchEditorFocusBody()
}

// macOS 无边框窗口：红绿灯浮在内容上，左栏顶部要预留一条拖拽区
const isMac = window.muse?.platform === 'darwin'

// ===== 右侧辅助栏：大纲 / 搜索 / AI 在同一位置切换（写文档时的贴身助手）=====
type PanelTab = 'ai' | 'search'
interface SidebarState {
  open: boolean
  tab: PanelTab
  width: number
}
const SIDEBAR_KEY = 'muse:sidebar:v1'
function loadSidebar(): SidebarState {
  try {
    const raw = localStorage.getItem(SIDEBAR_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<SidebarState>
      return {
        open: p.open !== false,
        // 搜索是临时态，重启后回到 AI，避免开机看到一个空搜索框
        tab: p.tab === 'search' ? 'search' : 'ai',
        width: Math.min(560, Math.max(300, Number(p.width) || 380)),
      }
    }
  } catch {
    /* 忽略损坏的持久化数据 */
  }
  return { open: true, tab: 'ai', width: 380 }
}
const sidebar = ref<SidebarState>(loadSidebar())
watch(
  sidebar,
  (s) => {
    try {
      localStorage.setItem(SIDEBAR_KEY, JSON.stringify(s))
    } catch {
      /* 存储满等场景静默失败 */
    }
  },
  { deep: true }
)

function onSidebarResize(width: number): void {
  sidebar.value.width = width
}

/** ⌘F / 菜单 / 顶栏放大镜：展开右栏并切到搜索页，焦点落进查找框 */
function openSearch(): void {
  sidebar.value.open = true
  sidebar.value.tab = 'search'
  search.open()
}

/** 底部搜索 icon：已开搜索则收起，否则打开并切到搜索页 */
function toggleSearch(): void {
  if (sidebar.value.open && sidebar.value.tab === 'search') {
    sidebar.value.open = false
    search.close()
  } else {
    openSearch()
  }
}

/** 底部 AI icon：已开 AI 则收起，否则打开并切到 AI 页 */
function toggleAi(): void {
  if (sidebar.value.open && sidebar.value.tab === 'ai') {
    sidebar.value.open = false
  } else {
    sidebar.value.open = true
    sidebar.value.tab = 'ai'
  }
}

// @antdv-next/x 组件库中文文案
const chatLocale: XProviderProps['locale'] = {
  locale: 'zh-cn',
  Conversations: { create: '新对话' },
  Sender: { stopLoading: '停止请求', speechRecording: '正在录音' },
  Bubble: { editableOk: '确认', editableCancel: '取消' },
}

/**
 * 新建：有工作区就在工作区里落一个真实文件（左栏能立刻看到并重命名），
 * 没有工作区才退回「未命名草稿 + 另存为」的老路径。
 */
async function createDoc(): Promise<void> {
  if (workspaceRoot.value) {
    const p = await createWorkspaceFile()
    if (p) {
      await openPath(p)
      return
    }
  }
  await newFile()
}

// 启动：Typora 式 mac/win 一致 — 无外部打开文件时，默认在文稿中落盘一个 Untitled.md 真实文件
// 无“未保存”概念，自动保存直接写该文件；最近文件仅作记录
void window.muse?.invoke('fs:readRecent').then((r) => {
  recentFiles.value = Array.isArray(r) ? (r as string[]) : []
})
void (async () => {
  try {
    const pending = (await window.muse?.invoke('app:get-open-paths')) as OpenPathItem[] | null
    if (pending && pending.length) {
      await handleOpenPaths(pending)
      if (started.value) return
    }
  } catch {}
  // 不再恢复草稿，直接新建落盘文件（mac/win 行为一致）
  void window.muse?.invoke('fs:clearDraft')
  await newFile()
})()

let offOpenPaths: (() => void) | null = null
let offMenu: (() => void) | null = null
let offRequestClose: (() => void) | null = null
onMounted(() => {
  // macOS：Dock / Finder 拖入的文件（运行中拖入直接打开）
  offOpenPaths?.()
  offOpenPaths = window.muse?.on('app:open-paths', (payload: unknown) => {
    void handleOpenPaths(payload as OpenPathItem[])
  }) ?? null

  offMenu?.()
  offMenu = window.muse?.on('menu:action', (payload: unknown) => {
    const { action, path, format } = payload as { action: string; path?: string; format?: FormatAction }
    if (action === 'new') void createDoc()
    else if (action === 'open') void open()
    else if (action === 'open-recent' && path) void openPath(path)
    else if (action === 'save') void save()
    else if (action === 'saveAs') void saveAs()
    else if (action === 'find') openSearch()
    // ---- Typora 对齐：段落 / 格式 / 视图 / 导出 ----
    else if (action === 'format' && format) dispatchFormat(format)
    else if (action === 'link') openLinkModal()
    else if (action === 'insert-image') void insertImageFromDialog()
    else if (action === 'source-mode') toggleSourceMode()
    else if (action === 'focus-mode') setViewMode('focus')
    else if (action === 'typewriter-mode') setViewMode('typewriter')
    else if (action === 'toggle-outline') setViewMode('outline')
    else if (action === 'toggle-files') toggleFilesSidebar()
    else if (action === 'open-folder') void openFolderFlow()
    else if (action === 'export-pdf') void exportPdf()
    else if (action === 'export-html') void exportHtml()
  }) ?? null

  offRequestClose?.()
  offRequestClose = window.muse?.on('app:request-close', () => {
    void handleCloseRequest()
  }) ?? null

  // 树内重命名当前文档 → 同步路径（原文件监听跟随新路径）
  window.addEventListener('muse:tree-renamed', onTreeRenamed)

  // 编辑器内 ⌘K / Ctrl⌘I（typoraKeymap 派发）→ 链接 / 插入图片
  window.addEventListener('muse:request-link', onRequestLink)
  window.addEventListener('muse:request-image', onRequestImage)

  // 查找快捷键：⌘F 打开、⌘G / ⇧⌘G 下一个/上一个、Esc 关闭
  // Typora 视图快捷键：⌘/ 源代码模式、F8 专注、F9 打字机
  window.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()
    if (mod && key === 'f') {
      e.preventDefault()
      openSearch()
    } else if (mod && key === 'g') {
      e.preventDefault()
      search.request(e.shiftKey ? 'prev' : 'next')
    } else if (mod && key === '/') {
      e.preventDefault()
      toggleSourceMode()
    } else if (e.key === 'F8') {
      e.preventDefault()
      setViewMode('focus')
    } else if (e.key === 'F9') {
      e.preventDefault()
      setViewMode('typewriter')
    } else if (e.key === 'Escape' && search.isOpen.value) {
      e.preventDefault()
      search.close()
      if (sidebar.value.tab === 'search') sidebar.value.tab = 'ai'
    }
  })
})

onUnmounted(() => {
  offOpenPaths?.()
  offMenu?.()
  offRequestClose?.()
  window.removeEventListener('muse:tree-renamed', onTreeRenamed)
  window.removeEventListener('muse:request-link', onRequestLink)
  window.removeEventListener('muse:request-image', onRequestImage)
})

watch(title, (t) => {
  document.title = t
}, { immediate: true })

/** 状态栏左侧：工作区内文件显示相对路径，工作区外显示完整路径 */
const docLocation = computed(() => {
  const path = currentPath.value
  if (!path) return started.value ? '未保存的草稿' : ''
  const root = workspaceRoot.value
  if (root && path.startsWith(root)) return path.slice(root.length).replace(/^[\\/]/, '')
  return path
})

/**
 * 树刷新后与当前文档对账：当前文件若已从工作区消失（在访达里删了 / 移走了），
 * 关掉它回到空态。不然自动保存会用 writeFileSync 把它凭空写回来。
 * 只管工作区内的文件——⌘O 打开的外部文件本来就不在树里。
 */
function existsInTree(nodes: TreeNode[], path: string): boolean {
  return nodes.some((n) =>
    n.type === 'file' ? n.path === path : (n.children ? existsInTree(n.children, path) : false)
  )
}

watch(workspaceTree, (nodes) => {
  const path = currentPath.value
  const root = workspaceRoot.value
  if (!path || !root) return
  const sep = path.includes('\\') ? '\\' : '/'
  if (!path.startsWith(root + sep)) return
  if (!existsInTree(nodes, path)) {
    closeDoc()
    // 去除 empty 页面：文件被外部删除后直接新建空白文档
    void nextTick(() => {
      if (!started.value) void newFile()
    })
  }
})

interface OpenPathItem {
  path: string
  isDir: boolean
}

/** macOS Dock / Finder「打开方式」：仅打开文档，文件夹拖入不再作为工作区 */
async function handleOpenPaths(items: OpenPathItem[]): Promise<void> {
  const list = Array.isArray(items) ? items : []
  if (!list.length) return
  const files = list.filter((i) => !i.isDir && /\.(md|markdown|mdx|txt)$/i.test(i.path))
  if (files.length) await openPath(files[0].path)
}

async function onDrop(e: DragEvent): Promise<void> {
  const f = e.dataTransfer?.files?.[0]
  if (!f) return
  // 图片交给编辑器 drop 插件（拷入 assets/ 后插入），这里只负责打开文档 / 文件夹
  if (f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(f.name)) return
  const path = window.muse?.getPathForFile(f)
  if (!path) return
  const isDir = (await window.muse?.invoke('fs:isDir', path)) as boolean
  if (isDir) {
    // 拖入文件夹 → 作为工作区打开并展开文件栏（Typora 行为）
    await setRoot(path)
    viewMode.value.files = true
    return
  }
  void openPath(path)
}

// ===== 大纲：点击跳转 + 滚动高亮当前章节 =====
const editorScrollRef = ref<HTMLElement | null>(null)
const activeHeading = ref(-1)

/** 点击大纲跳转：按文档顺序匹配第 index 个标题 DOM */
function scrollToHeading(index: number): void {
  activeHeading.value = index
  const heads = editorScrollRef.value?.querySelectorAll(
    '.ProseMirror h1,.ProseMirror h2,.ProseMirror h3,.ProseMirror h4,.ProseMirror h5,.ProseMirror h6'
  )
  heads?.[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** 滚动时同步「当前章节」高亮：取越过顶部阈值线的最后一个标题 */
let scrollRaf = 0
function onEditorScroll(): void {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0
    const container = editorScrollRef.value
    if (!container) return
    const heads = container.querySelectorAll<HTMLElement>(
      '.ProseMirror h1,.ProseMirror h2,.ProseMirror h3,.ProseMirror h4,.ProseMirror h5,.ProseMirror h6'
    )
    if (!heads.length) {
      activeHeading.value = -1
      return
    }
    const cTop = container.getBoundingClientRect().top
    const threshold = 40
    let active = -1
    heads.forEach((el, i) => {
      if (el.getBoundingClientRect().top - cTop <= threshold) active = i
    })
    activeHeading.value = active === -1 ? 0 : active
  })
}

// 文档变化（打开 / 新建 / 编辑标题）后重置高亮并重算
watch(headings, () => {
  activeHeading.value = headings.value.length ? 0 : -1
  void nextTick(onEditorScroll)
})

// ===== 右键上下文菜单（Typora 式）=====
const ctxMenu = ref({ open: false, x: 0, y: 0, inTable: false })

function onEditorContextmenu(e: MouseEvent): void {
  const target = e.target as HTMLElement
  const inTable = !!target.closest('.ProseMirror table')
  ctxMenu.value = { open: true, x: e.clientX, y: e.clientY, inTable }
  // 表格内：先把点击处单元格设为选区，行列命令才能作用到正确位置
  if (inTable) dispatchSelectCell(e.clientX, e.clientY)
}

function onCtxFormat(action: FormatAction): void {
  dispatchFormat(action)
}

function onCtxClipboard(op: 'cut' | 'copy' | 'paste'): void {
  void window.muse?.invoke('app:webctx', op)
}

// ===== 链接弹窗（⌘K / 菜单 / 右键 / 气泡工具条）=====
// 状态在模块级单例：选中气泡工具条（编辑器内部）也要能打开它
const { linkModalOpen, linkText, openLinkModal } = useLinkModal()

function applyLinkHref(href: string): void {
  dispatchFormat('link', href)
}

// 编辑器内快捷键（typoraKeymap 派发窗口事件）：⌘K 链接、Ctrl⌘I 插图
function onRequestLink(): void {
  openLinkModal()
}
function onRequestImage(): void {
  void insertImageFromDialog()
}

// ===== 插入图片：选文件 → 拷入 assets/ → 光标处插入 =====
async function insertImageFromDialog(): Promise<void> {
  const rel = (await window.muse?.invoke('fs:pickAndSaveImage', currentPath.value ?? '')) as string | null
  if (rel) dispatchInsertImage(rel)
}

// ===== 导出（Typora「文件 > 导出」）=====
async function exportPdf(): Promise<void> {
  clearBlockRange() // 先把多块选中的高亮清掉，PDF 里不留底色
  // exporting 类：隐藏侧栏/状态栏，正文占满页宽（见 base.css）
  document.body.classList.add('exporting')
  try {
    await nextTick()
    await window.muse?.invoke('app:export-pdf', filename.value || '未命名.md')
  } finally {
    document.body.classList.remove('exporting')
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
}

const EXPORT_CSS = `
  body{margin:0;padding:48px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#1f2328;background:#fff;line-height:1.7}
  article{max-width:46rem;margin:0 auto}
  h1,h2,h3,h4,h5,h6{margin:1.2em 0 .6em;line-height:1.3}
  h1{font-size:2em;border-bottom:1px solid #eaecef;padding-bottom:.3em}
  pre{background:#f6f8fa;padding:12px 16px;border-radius:8px;overflow:auto}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em}
  p code,li code{background:#f6f8fa;padding:2px 5px;border-radius:4px}
  blockquote{margin:0;padding:0 1em;color:#6a737d;border-left:.25em solid #dfe2e5}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #dfe2e5;padding:6px 12px}
  img{max-width:100%}
  hr{border:none;border-top:2px solid #eaecef;margin:2em 0}
  .katex{font-size:1.05em}
`

async function exportHtml(): Promise<void> {
  clearBlockRange() // 多块选中高亮不进导出 HTML
  const bodyHtml = editorScrollRef.value?.querySelector('.ProseMirror')?.innerHTML ?? ''
  const titleHtml = titleText.value.trim() ? `<h1>${escapeHtml(titleText.value.trim())}</h1>` : ''
  const html = `<!doctype html>
<html lang="zh-cn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(titleText.value.trim() || filename.value)}</title>
<style>${EXPORT_CSS}</style>
</head>
<body><article>${titleHtml}
${bodyHtml}</article></body>
</html>`
  await window.muse?.invoke('app:export-html', html, filename.value || '未命名.md')
}

/** AI 回答 → 插入到正文（按 markdown 解析后落到光标处） */
function insertIntoDoc(text: string): void {
  if (!text.trim()) return
  dispatchEditorInsert(text)
}

/** AI 回答 → 替换选中的原文（带原文一致性校验，防误删） */
function replaceFromChat(payload: {
  from: number
  to: number
  expectedText: string
  text: string
}): void {
  if (!payload.text.trim()) return
  dispatchEditorReplaceSelection(payload.from, payload.to, payload.expectedText, payload.text)
}

/** 惰性取正文：仅在「引用当前文档」提问时调用，避免每键重渲染聊天树 */
const getDocContext = (): string => fullContent.value
</script>

<template>
  <ConfigProvider :theme="themeConfig">
    <ThemeProvider :appearance="appearance">
      <div class="h-full flex flex-col bg-bg" @dragover.prevent @drop.prevent="onDrop">
        <!-- 编辑器区：顶栏 + 左栏文件树 + 中栏编辑区 + 右栏辅助面板 -->
        <div class="flex flex-1 min-h-0 flex-col">
          <TitleBar
            data-export-hide
            :filename="filename"
            :dirty="dirty"
            :saving="saving"
            :started="started"
            :is-mac="isMac"
            :location="docLocation"
            :path="currentPath"
            @reveal="revealInFolder(currentPath)"
            @editTitle="handleTitleBarEdit"
          />

          <div class="flex flex-1 min-h-0">
            <!-- 左栏：文件树（Typora「文件」面板，⌘⇧L / 底部工具条切换） -->
            <FileTreePanel v-show="viewMode.files" :active-path="currentPath" @open="openPath" />

            <!-- 中栏：顶栏下方是 Markdown 编辑区 -->
            <main class="flex-1 min-w-0 flex flex-col bg-bg">
              <!-- 编辑器：标题与正文分离，各自独立输入 + 常驻 placeholder -->
              <div class="flex-1 min-h-0 relative" @contextmenu.prevent="onEditorContextmenu">
              <div
                ref="editorScrollRef"
                class="absolute inset-0 overflow-y-auto editor-scroll"
                :class="{ 'focus-mode': viewMode.focus }"
                @scroll.passive="onEditorScroll"
              >
                <div class="mx-auto max-w-[46rem] px-12 pt-8 pb-32">
                  <input
                    v-show="!viewMode.source"
                    ref="titleInputRef"
                    v-model="titleText"
                    placeholder="无标题"
                    class="title-input w-full bg-transparent outline-none border-none text-[30px] font-bold leading-tight placeholder:text-[var(--fg-soft)] placeholder:opacity-60 mb-4 text-left"
                    spellcheck="false"
                    @keydown.enter="onTitleEnter"
                  />
                  <div v-show="!viewMode.source">
                    <MilkdownEditor v-model="doc" />
                  </div>
                </div>
              </div>
              <!-- 源代码模式（⌘/）：整页等宽 markdown 原文 -->
              <SourceEditor
                v-if="viewMode.source"
                :content="sourceText"
                @change="onSourceChange"
                @exit="toggleSourceMode"
              />
                <!-- 文章右侧导航竖轨：hover 预览 / 点击跳转 / 当前章节常亮 -->
                <OutlinePanel
                  v-if="viewMode.outline && headings.length >= 2"
                  data-export-hide
                  :headings="headings"
                  :active="activeHeading"
                  @jump="scrollToHeading"
                />
              </div>
            </main>

            <!-- 右栏：AI / 大纲（常驻挂载，聊天草稿与流式不丢；宽度折叠动画） -->
            <Transition name="sidebar">
            <SidePanel
              v-show="sidebar.open"
              data-export-hide
              :tab="sidebar.tab"
              :width="sidebar.width"
              @resize="onSidebarResize"
            >
              <template #search>
                <SearchPanel />
              </template>
              <template #ai>
                <XProvider :theme="themeConfig" :locale="chatLocale">
                  <ChatPanel
                    :is-dark="isDark"
                    :get-doc-context="getDocContext"
                    @manage="showSettings = true"
                    @insert="insertIntoDoc"
                    @replace-selection="replaceFromChat"
                  />
                </XProvider>
              </template>
            </SidePanel>
          </Transition>
          </div>
        </div>

        <!-- 整窗底部工具条：一排 icon，左右 justify-between（Zed 式） -->
        <StatusBar
          data-export-hide
          :stats="stats"
          :ai-open="sidebar.open && sidebar.tab === 'ai'"
          :search-open="sidebar.open && sidebar.tab === 'search'"
          :files-open="viewMode.files"
          :is-dark="isDark"
          :theme-name="currentTheme.name"
          @new="createDoc"
          @toggle-search="toggleSearch"
          @toggle-ai="toggleAi"
          @toggle-files="toggleFilesSidebar"
          @toggle-theme="toggle"
          @settings="showSettings = true"
          @open-file="open()"
          @open-folder="openFolderFlow"
        />

        <SettingsModal :open="showSettings" @close="showSettings = false" />
        <EditorContextMenu
          :open="ctxMenu.open"
          :x="ctxMenu.x"
          :y="ctxMenu.y"
          :in-table="ctxMenu.inTable"
          @close="ctxMenu.open = false"
          @format="onCtxFormat"
          @clipboard="onCtxClipboard"
          @link="openLinkModal"
          @image="insertImageFromDialog"
        />
        <LinkModal
          :open="linkModalOpen"
          :initial-text="linkText"
          @close="linkModalOpen = false"
          @confirm="applyLinkHref"
        />
      </div>
    </ThemeProvider>
  </ConfigProvider>
</template>
