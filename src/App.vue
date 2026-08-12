<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ConfigProvider, theme as antdTheme } from 'antdv-next'
import { ThemeProvider } from 'antdv-style'
import { XProvider } from '@antdv-next/x'
import type { XProviderProps } from '@antdv-next/x'
import MilkdownEditor from './editor/MilkdownEditor.vue'
import EntryScreen from './components/EntryScreen.vue'
import FileSidebar from './components/FileSidebar.vue'
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

const { isDark, toggle } = useTheme()

// antdv 主题接管：appearance 驱动 antdv-style 注入 --ant-color-* CSS 变量，
// algorithm 驱动 ConfigProvider 的暗色 token 派生。isDark 仍是单一真相源。
const appearance = computed(() => (isDark.value ? 'dark' : 'light'))

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
  colorTextTertiary: '#9a9aa0',
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
  colorTextTertiary: '#6e6e70',
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
const themeConfig = computed(() => ({
  algorithm: isDark.value ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  token: isDark.value ? shadcnDark : shadcnLight,
}))
const {
  doc,
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
  collapsed: railCollapsed,
  toggleCollapsed: toggleRail,
  pickFolder: pickWorkspaceFolder,
  createFile: createWorkspaceFile
} = useWorkspace()

const stats = useDocStats(doc)
const headings = useOutline(doc)
const search = useSearch()
const { settings } = useSettings()

const showSettings = ref(false)
const recentFiles = ref<string[]>([])

// macOS 无边框窗口：红绿灯浮在内容上，左栏顶部要预留一条拖拽区
const isMac = window.muse?.platform === 'darwin'

// ===== 右侧辅助栏：大纲 / 搜索 / AI 在同一位置切换（写文档时的贴身助手）=====
type PanelTab = 'ai' | 'outline' | 'search'
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
        // 搜索是临时态，重启后回到大纲，避免开机看到一个空搜索框
        tab: p.tab === 'outline' || p.tab === 'search' ? 'outline' : 'ai',
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

function onPanelTab(tab: PanelTab): void {
  sidebar.value.tab = tab
  if (tab === 'search') search.open()
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

// 启动：先拉最近文件供 Entry 页展示；再尝试恢复未命名草稿。
// 没有草稿则停在 Entry 欢迎页（started 仍为 false），不再自动填入默认示例文档。
void window.muse?.invoke('fs:readRecent').then((r) => {
  recentFiles.value = Array.isArray(r) ? (r as string[]) : []
})
void restoreDraft()

onMounted(() => {
  window.muse?.on('menu:action', (payload: unknown) => {
    const { action, path } = payload as { action: string; path?: string }
    if (action === 'new') void createDoc()
    else if (action === 'open') void open()
    else if (action === 'open-recent' && path) void openPath(path)
    else if (action === 'save') void save()
    else if (action === 'saveAs') void saveAs()
    else if (action === 'find') openSearch()
  })

  window.muse?.on('app:request-close', () => {
    void handleCloseRequest()
  })

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
      if (sidebar.value.tab === 'search') sidebar.value.tab = 'outline'
    }
  })
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
  if (!existsInTree(nodes, path)) closeDoc()
})

function onDrop(e: DragEvent): void {
  const f = e.dataTransfer?.files?.[0]
  if (!f) return
  const path = window.muse?.getPathForFile(f)
  if (path) void openPath(path)
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
const getDocContext = (): string => doc.value
</script>

<template>
  <ConfigProvider :theme="themeConfig">
    <ThemeProvider :appearance="appearance">
      <div class="flex h-full bg-bg" @dragover.prevent @drop.prevent="onDrop">
        <!-- 左栏：菜单 + 工作区文件树（含主题 / 设置入口） -->
        <FileSidebar
          v-show="!railCollapsed"
          :current="currentPath"
          :is-dark="isDark"
          :is-mac="isMac"
          @open="openPath"
          @renamed="setPath"
          @removed="closeDoc"
          @new="createDoc"
          @find="openSearch"
          @toggle-theme="toggle"
          @settings="showSettings = true"
        />

        <!-- 中栏：顶栏 + Markdown 编辑区 + 信息条 -->
        <main class="flex-1 min-w-0 flex flex-col bg-bg">
          <TitleBar
            :filename="filename"
            :dirty="dirty"
            :saving="saving"
            :started="started"
            :rail-collapsed="railCollapsed"
            :ai-open="sidebar.open"
            :is-mac="isMac"
            @find="openSearch"
            @toggle-rail="toggleRail"
            @toggle-ai="sidebar.open = !sidebar.open"
          />

          <!-- 未打开任何文档：欢迎页 / 选文件提示 -->
          <div v-if="!started" class="flex-1 min-h-0 flex">
            <EntryScreen
              v-if="!workspaceRoot"
              :recent="recentFiles"
              @new="createDoc"
              @open="open"
              @open-folder="pickWorkspaceFolder()"
              @open-recent="openPath"
            />
            <div v-else class="flex-1 flex items-center justify-center text-sm text-fg-dim">
              从左侧选择一个文件
            </div>
          </div>

          <!-- 编辑器：内部滚动，正文限宽居中 -->
          <div
            v-else
            ref="editorScrollRef"
            class="flex-1 min-h-0 overflow-y-auto editor-scroll"
            @scroll.passive="onEditorScroll"
          >
            <MilkdownEditor v-model="doc" class="mx-auto max-w-[46rem] px-12 pt-6 pb-32" />
          </div>

          <StatusBar :stats="stats" :location="docLocation" :path="currentPath" />
        </main>

        <!-- 右栏：AI / 大纲（常驻挂载，聊天草稿与流式不丢；宽度折叠动画） -->
        <Transition name="sidebar">
          <SidePanel
            v-show="sidebar.open"
            :tab="sidebar.tab"
            :width="sidebar.width"
            @update:tab="onPanelTab"
            @close="sidebar.open = false"
            @resize="onSidebarResize"
          >
            <template #outline>
              <OutlinePanel :headings="headings" :active="activeHeading" @jump="scrollToHeading" />
            </template>
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

        <SettingsModal :open="showSettings" @close="showSettings = false" />
      </div>
    </ThemeProvider>
  </ConfigProvider>
</template>
