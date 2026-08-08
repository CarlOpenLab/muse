<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { Sun, Moon, PanelLeft, Settings as SettingsIcon } from '@lucide/vue'
import MilkdownEditor from './editor/MilkdownEditor.vue'
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
  filename,
  title,
  newFile,
  open,
  openPath,
  save,
  saveAs,
  handleCloseRequest,
  loadContent,
  restoreDraft
} = useFile()

const stats = useDocStats(doc)
const headings = useOutline(doc)
const search = useSearch()
const { settings } = useSettings()

const showOutline = ref(true)
const showSettings = ref(false)

const DEFAULT_DOC =
  '# md-ai\n\n' +
  '一个 **Typora 式** 的 Markdown 编辑器，正在用 Milkdown 做 WYSIWYG 即时渲染。\n\n' +
  '## 功能演示\n\n' +
  '打字时 `#` 会变成标题、`**加粗**` 会即时生效、`-` 会变成列表：\n\n' +
  '- 列表项一\n- 列表项二\n- 列表项三\n\n' +
  '> 引用块：所见即所得。\n\n' +
  '```js\nfunction hello(name) {\n  return `Hello, ${name}!`\n}\n```\n\n' +
  '```ts\ninterface User { id: number; name: string }\nconst u: User = { id: 1, name: "md-ai" }\n```\n\n' +
  '```python\ndef greet(name):\n    return f"Hello, {name}!"\n```\n\n' +
  '代码块现在用 **Shiki** 做语法高亮（打字即时变色）。✅ Phase 2\n\n' +
  '---\n\n试试 **⌘O 打开** / **⌘S 保存** / **⌘N 新建**，或把 .md 文件拖进窗口。✅ Phase 3\n'

// setup 阶段载入默认文档，再尝试恢复未命名草稿（覆盖默认文档）
loadContent(null, DEFAULT_DOC)
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
            <div
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
