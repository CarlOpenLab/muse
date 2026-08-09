<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Sun, Moon, PanelRight, Settings as SettingsIcon } from '@lucide/vue'
import { ConfigProvider, theme as antdTheme } from 'antdv-next'
import { ThemeProvider } from 'antdv-style'
import MilkdownEditor from './editor/MilkdownEditor.vue'
import EntryScreen from './components/EntryScreen.vue'
import { useTheme } from './composables/useTheme'
import { useFile } from './composables/useFile'
import { useDocStats } from './composables/useDocStats'
import { useOutline } from './composables/useOutline'
import { useSearch } from './composables/useSearch'
import { useSettings } from './composables/useSettings'
import OutlinePanel from './components/OutlinePanel.vue'
import StatusBar from './components/StatusBar.vue'
import SearchBar from './components/SearchBar.vue'
import SettingsPanel from './components/SettingsPanel.vue'

const { isDark, toggle } = useTheme()

// antdv 主题接管：appearance 驱动 antdv-style 注入 --ant-color-* CSS 变量，
// algorithm 驱动 ConfigProvider 的暗色 token 派生。isDark 仍是单一真相源。
const appearance = computed(() => (isDark.value ? 'dark' : 'light'))

// shadcn 主题 token：让 antd 组件对齐 shadcn-admin 质感，与 base.css 语义变量统一。
// - 亮色：slate 色板，主色近黑（#000），主按钮黑底白字；
// - 暗色：近黑中性灰画布（zinc-950）+ 略浮卡片（zinc-900）。antd 主按钮文字 /
//   复选框勾选色硬编码为 #fff（colorTextLightSolid），故暗色主色不能用近白（白字
//   不可见），改用比卡片更浅的 zinc-700 作主色——主按钮浅灰底白字、勾选色可读，
//   且比近黑卡片更亮从而「浮」出来；链接等「主色文字」单独覆盖为浅 zinc 保证可读。
const SHADCN_FONT =
  "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
const shadcnLight = {
  colorPrimary: '#000000',
  colorSuccess: '#16a34a',
  colorWarning: '#f59e0b',
  colorError: '#ef4444',
  colorInfo: '#3b82f6',
  colorTextBase: '#0f172a',
  colorBgBase: '#ffffff',
  colorPrimaryBg: '#f1f5f9',
  colorPrimaryBgHover: '#e2e8f0',
  colorPrimaryBorder: '#cbd5e1',
  colorPrimaryBorderHover: '#94a3b8',
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
  colorText: 'rgba(15, 23, 42, 0.95)',
  colorTextSecondary: 'rgba(15, 23, 42, 0.75)',
  colorTextTertiary: 'rgba(15, 23, 42, 0.55)',
  colorTextQuaternary: 'rgba(15, 23, 42, 0.25)',
  colorTextDisabled: 'rgba(15, 23, 42, 0.25)',
  colorBgContainer: '#ffffff',
  colorBgElevated: '#ffffff',
  colorBgLayout: '#f8fafc',
  colorBgSpotlight: 'rgba(15, 23, 42, 0.9)',
  colorBgMask: 'rgba(15, 23, 42, 0.4)',
  colorBorder: '#e2e8f0',
  colorBorderSecondary: '#f1f5f9',
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
  colorPrimary: '#3f3f46',
  colorPrimaryHover: '#52525b',
  colorPrimaryActive: '#27272a',
  colorPrimaryText: '#e4e4e7',
  colorPrimaryTextHover: '#fafafa',
  colorPrimaryTextActive: '#d4d4d8',
  colorPrimaryBg: '#27272a',
  colorPrimaryBgHover: '#3f3f46',
  colorPrimaryBorder: '#3f3f46',
  colorPrimaryBorderHover: '#52525b',
  colorSuccess: '#4ade80',
  colorWarning: '#fbbf24',
  colorError: '#f87171',
  colorInfo: '#60a5fa',
  colorTextBase: '#fafafa',
  colorBgBase: '#09090b',
  colorText: 'rgba(255, 255, 255, 0.95)',
  colorTextSecondary: 'rgba(255, 255, 255, 0.7)',
  colorTextTertiary: 'rgba(255, 255, 255, 0.5)',
  colorTextQuaternary: 'rgba(255, 255, 255, 0.25)',
  colorTextDisabled: 'rgba(255, 255, 255, 0.25)',
  colorBgContainer: '#0c0c0e',
  colorBgElevated: '#18181b',
  colorBgLayout: '#09090b',
  colorBgSpotlight: '#000000',
  colorBgMask: 'rgba(0, 0, 0, 0.5)',
  colorBorder: '#27272a',
  colorBorderSecondary: 'rgba(255, 255, 255, 0.1)',
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
  started,
  filename,
  title,
  newFile,
  open,
  openPath,
  save,
  saveAs,
  handleCloseRequest,
  restoreDraft
} = useFile()

const stats = useDocStats(doc)
const headings = useOutline(doc)
const search = useSearch()
const { settings } = useSettings()

const showOutline = ref(true)
const showSettings = ref(false)
const recentFiles = ref<string[]>([])

// 启动：先拉最近文件供 Entry 页展示；再尝试恢复未命名草稿。
// 没有草稿则停在 Entry 欢迎页（started 仍为 false），不再自动填入默认示例文档。
void window.md?.invoke('fs:readRecent').then((r) => {
  recentFiles.value = Array.isArray(r) ? (r as string[]) : []
})
void restoreDraft()

onMounted(() => {
  window.md?.on('menu:action', (payload: unknown) => {
    const { action, path } = payload as { action: string; path?: string }
    if (action === 'new') void newFile()
    else if (action === 'open') void open()
    else if (action === 'open-recent' && path) void openPath(path)
    else if (action === 'save') void save()
    else if (action === 'saveAs') void saveAs()
    else if (action === 'find') search.open()
  })

  window.md?.on('app:request-close', () => {
    void handleCloseRequest()
  })

  // 查找快捷键：⌘F 打开、⌘G / ⇧⌘G 下一个/上一个、Esc 关闭
  window.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()
    if (mod && key === 'f') {
      e.preventDefault()
      search.open()
    } else if (mod && key === 'g') {
      e.preventDefault()
      search.request(e.shiftKey ? 'prev' : 'next')
    } else if (e.key === 'Escape' && search.isOpen.value) {
      e.preventDefault()
      search.close()
    }
  })
})

watch(title, (t) => {
  document.title = t
}, { immediate: true })

/** 点击大纲跳转：按文档顺序匹配第 index 个标题 DOM */
function scrollToHeading(index: number): void {
  const heads = document.querySelectorAll(
    '.ProseMirror h1,.ProseMirror h2,.ProseMirror h3,.ProseMirror h4,.ProseMirror h5,.ProseMirror h6'
  )
  heads[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function onDrop(e: DragEvent): void {
  const f = e.dataTransfer?.files?.[0]
  if (!f) return
  const path = window.md?.getPathForFile(f)
  if (path) void openPath(path)
}
</script>

<template>
  <ConfigProvider :theme="themeConfig">
    <ThemeProvider :appearance="appearance">
      <div class="flex flex-col h-full" @dragover.prevent @drop.prevent="onDrop">
        <div class="flex flex-1 overflow-hidden">
          <!-- 左侧活动栏：主题 / 设置，常驻显示 -->
          <aside
            class="w-10 shrink-0 flex flex-col items-center gap-1 py-2 bg-bg-soft border-r border-border-subtle"
          >
            <!-- 底部：主题 / 设置 -->
            <div class="mt-auto flex flex-col items-center gap-1">
              <a-button type="text" shape="circle" size="small" @click="toggle">
                <template #icon>
                  <Sun v-if="isDark" :size="16" />
                  <Moon v-else :size="16" />
                </template>
              </a-button>
              <a-button type="text" shape="circle" size="small" @click="showSettings = true">
                <template #icon><SettingsIcon :size="16" /></template>
              </a-button>
            </div>
          </aside>

          <!-- 右侧内容区：画布 + 编辑卡片（卡片右上角放大纲折叠开关） -->
          <main class="flex-1 overflow-auto bg-page-bg">
            <div class="px-3 py-3 min-h-full flex flex-col">
              <div class="relative rounded-xl card-shadow flex-1 flex flex-col">
                <!-- 卡片右上角：大纲折叠开关（对齐 shadcn Header 的 SidebarTrigger） -->
                <div class="absolute top-2 right-2 z-10">
                  <a-button
                    type="text"
                    shape="circle"
                    size="small"
                    :title="showOutline ? '隐藏大纲' : '显示大纲'"
                    @click="showOutline = !showOutline"
                  >
                    <template #icon><PanelRight :size="16" /></template>
                  </a-button>
                </div>
                <!-- Entry 欢迎页：未新建 / 打开任何文档时显示 -->
                <div
                  v-if="!started"
                  class="rounded-xl border border-border bg-bg overflow-hidden flex-1 flex"
                >
                  <EntryScreen
                    :recent="recentFiles"
                    @new="newFile"
                    @open="open"
                    @open-recent="openPath"
                  />
                </div>

                <!-- 编辑器卡片 -->
                <div
                  v-else
                  class="rounded-xl border border-border bg-bg overflow-hidden flex-1"
                >
                  <MilkdownEditor v-model="doc" class="px-6 pt-6 pb-24" />
                </div>
              </div>
            </div>
          </main>

          <!-- 大纲侧边栏（右侧） -->
          <Transition name="sidebar">
            <OutlinePanel v-if="showOutline" :headings="headings" @jump="scrollToHeading" />
          </Transition>
        </div>

        <SettingsPanel :open="showSettings" @close="showSettings = false" />
        <SearchBar />
        <StatusBar :stats="stats" :filename="filename" :dirty="dirty" :path="currentPath" />
      </div>
    </ThemeProvider>
  </ConfigProvider>
</template>
