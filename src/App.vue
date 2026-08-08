<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { Sun, Moon, PanelLeft, Settings as SettingsIcon } from '@lucide/vue'
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
  <div class="flex flex-col h-full" @dragover.prevent @drop.prevent="onDrop">
    <div class="flex flex-1 overflow-hidden">
      <!-- 左侧大纲侧边栏：占位式折叠（shadcn 风格） -->
      <Transition name="sidebar">
        <OutlinePanel
          v-if="showOutline"
          :headings="headings"
          @jump="scrollToHeading"
          @close="showOutline = false"
        />
      </Transition>

      <!-- 右侧内容区：浅灰画布 + 白色编辑卡片（高度随窗口铺满） -->
      <main class="flex-1 overflow-auto bg-page-bg">
        <div class="px-3 py-3 min-h-full flex flex-col">
          <div class="relative rounded-xl card-shadow flex-1 flex flex-col">
            <!-- Entry 欢迎页：未新建/打开任何文档时显示 -->
            <div
              v-if="!started"
              class="rounded-xl border border-border-subtle bg-bg overflow-hidden flex-1 flex"
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
              class="rounded-xl border border-border-subtle bg-bg overflow-hidden flex-1"
            >
              <MilkdownEditor v-model="doc" class="px-6 pt-10 pb-24" />
            </div>

            <!-- 悬浮工具栏：固定在卡片右上角 -->
            <div class="absolute top-2 right-2 z-10 flex gap-1.5">
              <button
                class="w-8 h-8 flex items-center justify-center border border-border-subtle rounded-lg bg-bg text-fg-soft cursor-pointer shadow-sm transition-colors duration-150 hover:bg-bg-soft hover:text-fg"
                :class="{ 'text-accent! border-accent!': showOutline }"
                @click="showOutline = !showOutline"
                title="大纲"
              >
                <PanelLeft :size="16" />
              </button>
              <button
                class="w-8 h-8 flex items-center justify-center border border-border-subtle rounded-lg bg-bg text-fg cursor-pointer shadow-sm transition-colors duration-150 hover:bg-bg-soft"
                @click="toggle"
                :title="isDark ? '切换到亮色' : '切换到暗色'"
              >
                <Sun v-if="isDark" :size="16" />
                <Moon v-else :size="16" />
              </button>
              <button
                class="w-8 h-8 flex items-center justify-center border border-border-subtle rounded-lg bg-bg text-fg-soft cursor-pointer shadow-sm transition-colors duration-150 hover:bg-bg-soft hover:text-fg"
                @click="showSettings = true"
                title="设置"
              >
                <SettingsIcon :size="16" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>

    <Transition name="drawer">
      <SettingsPanel v-if="showSettings" @close="showSettings = false" />
    </Transition>

    <SearchBar />
    <StatusBar :stats="stats" :filename="filename" :dirty="dirty" :path="currentPath" />
  </div>
</template>
