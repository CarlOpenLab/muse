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
import { dispatchEditorInsert, dispatchEditorReplaceSelection } from './composables/useEditorControl'
import StatusBar from './components/StatusBar.vue'
import SearchPanel from './components/SearchPanel.vue'
import SettingsModal from './components/SettingsModal.vue'

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
  revealInFolder
} = useWorkspace()

const stats = useDocStats(fullContent)
const headings = useOutline(fullContent)
const search = useSearch()
const { settings } = useSettings()

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
    const { action, path } = payload as { action: string; path?: string }
    if (action === 'new') void createDoc()
    else if (action === 'open') void open()
    else if (action === 'open-recent' && path) void openPath(path)
    else if (action === 'save') void save()
    else if (action === 'saveAs') void saveAs()
    else if (action === 'find') openSearch()
  }) ?? null

  offRequestClose?.()
  offRequestClose = window.muse?.on('app:request-close', () => {
    void handleCloseRequest()
  }) ?? null

  // 查找快捷键：⌘F 打开、⌘G / ⇧⌘G 下一个/上一个、Esc 关闭
  window.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()
    if (mod && key === 'f') {
      e.preventDefault()
      openSearch()
    } else if (mod && key === 'g') {
      e.preventDefault()
      search.request(e.shiftKey ? 'prev' : 'next')
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

function onDrop(e: DragEvent): void {
  const f = e.dataTransfer?.files?.[0]
  if (!f) return
  const path = window.muse?.getPathForFile(f)
  if (!path) return
  // 仅打开文件，文件夹拖放不再处理（当前布局为单文档模式）
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
        <!-- 编辑器区：顶栏 + Markdown 编辑区（无左栏文件树，所有操作收到底部工具条） -->
        <div class="flex flex-1 min-h-0">
          <!-- 中栏：顶栏 + Markdown 编辑区 -->
          <main class="flex-1 min-w-0 flex flex-col bg-bg">
            <TitleBar
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

            <!-- 编辑器：标题与正文分离，各自独立输入 + 常驻 placeholder -->
            <div class="flex-1 min-h-0 relative">
              <div
                ref="editorScrollRef"
                class="absolute inset-0 overflow-y-auto editor-scroll"
                @scroll.passive="onEditorScroll"
              >
                <div class="mx-auto max-w-[46rem] px-12 pt-8 pb-32">
                  <input
                    ref="titleInputRef"
                    v-model="titleText"
                    placeholder="无标题"
                    class="title-input w-full bg-transparent outline-none border-none text-[30px] font-bold leading-tight placeholder:text-[var(--fg-soft)] placeholder:opacity-60 mb-4 text-left"
                    spellcheck="false"
                  />
                  <MilkdownEditor v-model="doc" />
                </div>
              </div>
              <!-- 文章右侧导航竖轨：hover 预览 / 点击跳转 / 当前章节常亮 -->
              <OutlinePanel
                v-if="headings.length >= 2"
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

        <!-- 整窗底部工具条：一排 icon，左右 justify-between（Zed 式） -->
        <StatusBar
          :stats="stats"
          :ai-open="sidebar.open && sidebar.tab === 'ai'"
          :search-open="sidebar.open && sidebar.tab === 'search'"
          :is-dark="isDark"
          :theme-name="currentTheme.name"
          @new="createDoc"
          @toggle-search="toggleSearch"
          @toggle-ai="toggleAi"
          @toggle-theme="toggle"
          @settings="showSettings = true"
          @open-file="open()"
        />

        <SettingsModal :open="showSettings" @close="showSettings = false" />
      </div>
    </ThemeProvider>
  </ConfigProvider>
</template>
