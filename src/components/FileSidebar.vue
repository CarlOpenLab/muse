<script setup lang="ts">
/**
 * 左侧菜单栏（结构对齐参考稿）。
 * 自上而下：
 *   顶部拖拽区（macOS 下红绿灯落在这里；工具按钮已统一收到底部工具条）
 *   主导航（新建文档）——唯一的大字号带图标行
 *   分组标题（工作区名）+ 该组的新建 / 刷新
 *   文件树（滚动区）
 * 搜索 / 打开文件夹 / 收起侧栏 / 主题 / 设置 均在底部工具条（StatusBar）。
 * 右边缘可拖拽调宽；宽度、折叠与展开状态由 useWorkspace 持久化。
 */
import { computed, ref } from 'vue'
import {
  FilePlus,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  SquarePen,
} from '@lucide/vue'
import FileTree from './FileTree.vue'
import { useWorkspace, type TreeNode } from '../composables/useWorkspace'

const props = defineProps<{
  /** 当前打开的文件路径（高亮用） */
  current: string | null
  isMac: boolean
}>()

const emit = defineEmits<{
  open: [path: string]
  /** 当前文件被重命名 -> 新路径 */
  renamed: [path: string]
  /** 当前文件被移除 */
  removed: []
  /** 主导航：新建文档（工作区内落真实文件，交给 App 决定） */
  new: []
}>()

const {
  root,
  rootName,
  tree,
  width,
  refresh,
  pickFolder,
  isExpanded,
  toggleDir,
  setWidth,
  createFile,
  createFolder,
  rename,
  remove,
  revealInFolder,
} = useWorkspace()

const isEmpty = computed(() => !tree.value.length)

// ===== 行内重命名 =====
const renaming = ref<string | null>(null)

async function onRename(payload: { node: TreeNode; name: string }): Promise<void> {
  const { node, name } = payload
  renaming.value = null
  if (!name.trim() || name === node.name) return
  const next = await rename(node.path, name)
  if (next && props.current === node.path) emit('renamed', next)
}

// ===== 右键菜单（轻量自绘浮层）=====
const menu = ref<{ node: TreeNode; x: number; y: number } | null>(null)

function openMenu(payload: { node: TreeNode; x: number; y: number }): void {
  // 贴近视口右/下边缘时回收，避免菜单跑到屏幕外
  const x = Math.min(payload.x, window.innerWidth - 180)
  const y = Math.min(payload.y, window.innerHeight - 210)
  menu.value = { node: payload.node, x, y }
  const close = (): void => {
    menu.value = null
    window.removeEventListener('mousedown', close)
    window.removeEventListener('blur', close)
  }
  setTimeout(() => {
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
  })
}

/** 新建落点：右键目录则在其内，右键文件则在其同级 */
function parentDir(node: TreeNode): string {
  if (node.type === 'dir') return node.path
  const i = Math.max(node.path.lastIndexOf('/'), node.path.lastIndexOf('\\'))
  return i > 0 ? node.path.slice(0, i) : (root.value ?? '')
}

async function menuNewFile(node: TreeNode): Promise<void> {
  const dir = parentDir(node)
  menu.value = null
  const p = await createFile(dir)
  if (p) {
    emit('open', p)
    renaming.value = p
  }
}

async function menuNewFolder(node: TreeNode): Promise<void> {
  const dir = parentDir(node)
  menu.value = null
  const p = await createFolder(dir)
  if (p) renaming.value = p
}

function menuRename(node: TreeNode): void {
  renaming.value = node.path
  menu.value = null
}

async function menuRemove(node: TreeNode): Promise<void> {
  const target = node.path
  menu.value = null
  const ok = await remove(target)
  if (ok && props.current === target) emit('removed')
}

function menuReveal(node: TreeNode): void {
  revealInFolder(node.path)
  menu.value = null
}

// ===== 顶部操作 =====
async function newFileAtRoot(): Promise<void> {
  const p = await createFile()
  if (p) {
    emit('open', p)
    renaming.value = p
  }
}

// ===== 拖拽调宽 =====
function startDrag(e: MouseEvent): void {
  e.preventDefault()
  const startX = e.clientX
  const startW = width.value
  const onMove = (ev: MouseEvent): void => setWidth(startW + (ev.clientX - startX))
  const onUp = (): void => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}
</script>

<template>
  <aside
    class="relative shrink-0 flex flex-col bg-bg-soft border-r border-border-strong"
    :style="{ width: `${width}px` }"
  >
    <!-- 顶部拖拽区：mac 下红绿灯浮在左侧，整条可拖动窗口（按钮已收到底部） -->
    <div
      class="h-12 shrink-0 flex items-center pr-2 app-drag"
      :class="isMac ? 'pl-[84px]' : 'pl-2'"
    />

    <!-- 主导航：新建文档 -->
    <nav class="shrink-0 px-2.5 pt-1 pb-2">
      <button type="button" class="rail-nav" @click="emit('new')">
        <SquarePen :size="16" class="rail-nav-icon" />
        <span>新建文档</span>
      </button>
    </nav>

    <!-- 分组标题：工作区名 + 该组操作（waku 分组标题：28px 高、12.5px medium、与内容左对齐） -->
    <div v-if="root" class="shrink-0 h-7 flex items-center gap-0.5 px-2.5">
      <span class="flex-1 min-w-0 truncate text-[12.5px] font-medium text-fg-dim" :title="root">
        {{ rootName }}
      </span>
      <a-tooltip title="新建文件">
        <button type="button" class="rail-icon-btn sm" @click="newFileAtRoot">
          <FilePlus :size="13" />
        </button>
      </a-tooltip>
      <a-tooltip title="刷新">
        <button type="button" class="rail-icon-btn sm" @click="refresh()">
          <RefreshCw :size="12" />
        </button>
      </a-tooltip>
    </div>

    <!-- 文件树 -->
    <div class="flex-1 min-h-0 overflow-y-auto px-2.5 pb-2">
      <FileTree
        v-if="root && !isEmpty"
        :nodes="tree"
        :depth="0"
        :current="current"
        :renaming="renaming"
        :is-expanded="isExpanded"
        @open="emit('open', $event.path)"
        @toggle="toggleDir($event.path)"
        @menu="openMenu"
        @rename="onRename"
        @cancel-rename="renaming = null"
      />
      <p v-else-if="root" class="px-2 py-3 text-xs text-fg-dim leading-relaxed">
        这个文件夹里还没有 Markdown，点上方 + 新建一个。
      </p>
      <button
        v-else
        type="button"
        class="rail-empty"
        @click="pickFolder()"
      >
        <FolderOpen :size="15" class="shrink-0" />
        <span>打开文件夹</span>
      </button>
    </div>

    <!-- 右边缘拖拽把手 -->
    <div class="rail-resizer" title="拖拽调整宽度" @mousedown="startDrag" />

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="menu"
        class="ctx-menu"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        @mousedown.stop
      >
        <button type="button" class="ctx-item" @click="menuNewFile(menu.node)">
          <FilePlus :size="13" />新建文件
        </button>
        <button type="button" class="ctx-item" @click="menuNewFolder(menu.node)">
          <FolderPlus :size="13" />新建文件夹
        </button>
        <div class="ctx-sep" />
        <button type="button" class="ctx-item" @click="menuRename(menu.node)">重命名</button>
        <button type="button" class="ctx-item" @click="menuReveal(menu.node)">
          在文件管理器中显示
        </button>
        <div class="ctx-sep" />
        <button type="button" class="ctx-item danger" @click="menuRemove(menu.node)">
          移到废纸篓
        </button>
      </div>
    </Teleport>
  </aside>
</template>
