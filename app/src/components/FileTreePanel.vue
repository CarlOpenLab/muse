<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from 'vue'
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  FolderSymlink,
} from '@lucide/vue'
import { useWorkspace, type TreeNode } from '../composables/useWorkspace'

/**
 * 左侧文件树侧栏（Typora「文件」面板）：
 * 打开文件夹 → 树形浏览 markdown 文件，点击打开，右键新建 / 重命名 / 删除 / Finder 显示。
 * 数据与操作全部来自 useWorkspace（fs:listTree / createFile / rename / trash），
 * 主进程递归监听目录，外部改动自动刷新。渲染用扁平列表（按展开态过滤），避免递归组件。
 */
const props = defineProps<{
  /** 当前打开的文档路径（树内高亮） */
  activePath: string | null
}>()

const emit = defineEmits<{
  /** 请求打开某个文件 */
  open: [path: string]
}>()

const ws = useWorkspace()

// ---- 扁平化可见行：父级目录全部展开的节点才可见 ----
interface Row {
  node: TreeNode
  depth: number
}

const byName = (a: TreeNode, b: TreeNode): number => a.name.localeCompare(b.name, 'zh-Hans-CN')

function flatten(nodes: TreeNode[], depth: number, out: Row[]): void {
  const dirs = nodes.filter((n) => n.type === 'dir').sort(byName)
  const files = nodes.filter((n) => n.type === 'file').sort(byName)
  for (const n of [...dirs, ...files]) {
    out.push({ node: n, depth })
    if (n.type === 'dir' && ws.isExpanded(n.path)) flatten(n.children ?? [], depth + 1, out)
  }
}

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  flatten(ws.tree.value ?? [], 0, out)
  return out
})

// ---- 行内重命名 ----
const renamingPath = ref<string | null>(null)
const renameValue = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
// v-for 内的条件输入框：用函数 ref 拿到唯一实例
function setRenameRef(el: unknown): void {
  renameInput.value = el instanceof HTMLInputElement ? el : null
}

async function startRename(node: TreeNode): Promise<void> {
  if (!ws.root.value || node.path === ws.root.value) return
  renamingPath.value = node.path
  renameValue.value = node.name
  await nextTick()
  renameInput.value?.focus()
  // 选中主名（不含扩展名），Typora 式
  const dot = node.name.lastIndexOf('.')
  renameInput.value?.setSelectionRange(0, dot > 0 ? dot : node.name.length)
}

async function commitRename(): Promise<void> {
  const path = renamingPath.value
  renamingPath.value = null
  if (!path) return
  const p = await ws.rename(path, renameValue.value)
  if (p) window.dispatchEvent(new CustomEvent('muse:tree-renamed', { detail: { oldPath: path, newPath: p } }))
}

// ---- 右键菜单 ----
const ctx = ref({ open: false, x: 0, y: 0, node: null as TreeNode | null })

function onNodeContextmenu(e: MouseEvent, node: TreeNode): void {
  e.preventDefault()
  e.stopPropagation()
  if (!ws.root.value) return
  ctx.value = { open: true, x: e.clientX, y: e.clientY, node }
}

interface CtxItem {
  label: string
  danger?: boolean
  act: () => void
}

const ctxItems = computed<CtxItem[]>(() => {
  const node = ctx.value.node
  if (!node) return []
  const items: CtxItem[] = []
  if (node.type === 'dir') {
    items.push(
      { label: '新建文件', act: () => void ws.createFile(node.path) },
      { label: '新建文件夹', act: () => void ws.createFolder(node.path) }
    )
  }
  if (node.path !== ws.root.value) {
    items.push(
      { label: '重命名…', act: () => void startRename(node) },
      {
        label: '移到废纸篓',
        danger: true,
        act: () => {
          // 废纸篓可恢复，但仍确认一次防误删（e2e 中 confirm 被覆盖）
          if (window.confirm(`确定把「${node.name}」移到废纸篓？`)) void ws.remove(node.path)
        },
      }
    )
  }
  items.push({ label: '在 Finder 中显示', act: () => ws.revealInFolder(node.path) })
  return items
})

function onCtx(item: CtxItem): void {
  ctx.value.open = false
  item.act()
}

/** 菜单定位：贴边翻转 */
const ctxStyle = computed(() => {
  const W = 200
  const H = ctxItems.value.length * 30
  const x = ctx.value.x + W > window.innerWidth ? ctx.value.x - W : ctx.value.x
  const y = ctx.value.y + H > window.innerHeight ? Math.max(8, ctx.value.y - H) : ctx.value.y
  return { left: `${x}px`, top: `${y}px` }
})

// ---- 拖拽调宽 ----
let dragging = false

function startDrag(e: MouseEvent): void {
  e.preventDefault()
  dragging = true
  const startX = e.clientX
  const startW = ws.width.value
  const onMove = (ev: MouseEvent): void => {
    if (!dragging) return
    ws.setWidth(startW + (ev.clientX - startX))
  }
  const onUp = (): void => {
    dragging = false
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
onUnmounted(() => {
  dragging = false
})
</script>

<template>
  <aside
    data-export-hide
    class="relative shrink-0 flex flex-col bg-bg border-r border-border-strong select-none"
    :style="{ width: `${ws.width.value}px` }"
  >
    <!-- 头部：工作区名 + 操作（mac 红绿灯浮在这条区上，app-drag 可拖窗） -->
    <div class="app-drag h-12 shrink-0 flex items-center gap-1 pl-3 pr-2 border-b border-border-subtle">
      <span class="flex-1 min-w-0 text-[12px] font-medium text-fg-dim truncate" :title="ws.root.value ?? ''">
        {{ ws.rootName.value || '未打开文件夹' }}
      </span>
      <template v-if="ws.root.value">
        <button class="tree-icon-btn" title="新建文件" @click="ws.createFile()">
          <FilePlus :size="14" />
        </button>
        <button class="tree-icon-btn" title="新建文件夹" @click="ws.createFolder()">
          <FolderPlus :size="14" />
        </button>
      </template>
    </div>

    <!-- 空态：引导打开文件夹 -->
    <div v-if="!ws.root.value" class="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <FolderSymlink :size="28" class="text-fg-dim opacity-60" />
      <p class="text-[12px] text-fg-dim leading-relaxed">打开一个文件夹，<br />在这里浏览它的 Markdown 文件</p>
      <button class="tree-open-btn" @click="void ws.pickFolder()">打开文件夹…</button>
    </div>

    <!-- 文件树（扁平行） -->
    <div v-else class="flex-1 min-h-0 overflow-y-auto py-1.5 text-[13px]">
      <div
        v-for="row in rows"
        :key="row.node.path"
        class="tree-row"
        :class="{ active: row.node.type === 'file' && row.node.path === activePath }"
        :style="{ paddingLeft: `${10 + row.depth * 16}px` }"
        @click="
          row.node.type === 'dir'
            ? ws.toggleDir(row.node.path)
            : emit('open', row.node.path)
        "
        @contextmenu="onNodeContextmenu($event, row.node)"
      >
        <template v-if="row.node.type === 'dir'">
          <ChevronDown v-if="ws.isExpanded(row.node.path)" :size="13" class="shrink-0 text-fg-dim" />
          <ChevronRight v-else :size="13" class="shrink-0 text-fg-dim" />
          <FolderOpen v-if="ws.isExpanded(row.node.path)" :size="15" class="shrink-0 text-fg-dim" />
          <FolderClosed v-else :size="15" class="shrink-0 text-fg-dim" />
        </template>
        <template v-else>
          <span class="w-[13px] shrink-0" />
          <FileText :size="15" class="shrink-0 text-fg-dim" />
        </template>

        <!-- 重命名态：行内输入框 -->
        <input
          v-if="renamingPath === row.node.path"
          :ref="setRenameRef"
          v-model="renameValue"
          class="flex-1 min-w-0 h-5 px-1 rounded border border-border-strong bg-bg text-[12.5px] text-fg outline-none"
          spellcheck="false"
          @click.stop
          @keydown.enter.prevent="commitRename"
          @keydown.esc.prevent="renamingPath = null"
          @blur="commitRename"
        />
        <span v-else class="flex-1 min-w-0 truncate" :title="row.node.path">{{ row.node.name }}</span>
      </div>
    </div>

    <!-- 左栏右边缘拖拽把手 -->
    <div class="tree-resizer" title="拖拽调整宽度" @mousedown="startDrag" />

    <!-- 树右键菜单 -->
    <Teleport to="body">
      <template v-if="ctx.open">
        <div class="fixed inset-0 z-40" @mousedown.prevent="ctx.open = false" @contextmenu.prevent="ctx.open = false" />
        <div
          class="ctx-menu fixed z-50 py-1.5 rounded-lg border border-border-strong bg-bg-elev shadow-lg"
          :style="ctxStyle"
        >
          <button
            v-for="item in ctxItems"
            :key="item.label"
            class="ctx-menu-item"
            :class="{ danger: item.danger }"
            @click="onCtx(item)"
          >
            <span>{{ item.label }}</span>
          </button>
        </div>
      </template>
    </Teleport>
  </aside>
</template>

<style scoped>
.tree-resizer {
  position: absolute;
  top: 0;
  right: -3px;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
}
.tree-resizer:hover {
  background: color-mix(in srgb, var(--fg) 14%, transparent);
}
.tree-row {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding-right: 8px;
  margin: 0 6px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--fg);
  white-space: nowrap;
}
.tree-row:hover {
  background: color-mix(in srgb, var(--fg) 7%, transparent);
}
.tree-row.active {
  background: color-mix(in srgb, var(--fg) 10%, transparent);
  font-weight: 500;
}
.tree-icon-btn,
.tree-row .tree-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  color: var(--fg-dim);
  cursor: pointer;
}
.tree-icon-btn:hover {
  background: color-mix(in srgb, var(--fg) 10%, transparent);
  color: var(--fg);
}
.tree-open-btn {
  padding: 5px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--fg);
  font-size: 12.5px;
  cursor: pointer;
}
.tree-open-btn:hover {
  background: color-mix(in srgb, var(--fg) 7%, transparent);
}
.ctx-menu-item.danger {
  color: #cf222e;
}
:root.dark .ctx-menu-item.danger {
  color: #f85149;
}
</style>
