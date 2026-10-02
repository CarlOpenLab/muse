<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { closeBlockMenu, invokeBlockMenu, useBlockMenu } from './blockMenuState'

/**
 * 块操作菜单（Teleport 到 body，fixed 定位）。
 * 两种模式：
 *   action — ⠿ 点击：转换为…（表格块隐藏）+ 操作（副本 / 复制 Markdown / 删除）
 *   insert — ＋ 插入空段落后的类型选择
 * 键盘：↑↓ 移动、Enter 执行、Esc 关闭。
 */
const { menu } = useBlockMenu()

interface Item {
  id: string
  label: string
  shortcut?: string
  danger?: boolean
}
interface Group {
  title: string
  items: Item[]
}

const CONVERT: Item[] = [
  { id: 'paragraph', label: '正文', shortcut: '⌘0' },
  { id: 'heading-1', label: '一级标题', shortcut: '⌘1' },
  { id: 'heading-2', label: '二级标题', shortcut: '⌘2' },
  { id: 'heading-3', label: '三级标题', shortcut: '⌘3' },
  { id: 'quote', label: '引用' },
  { id: 'bullet-list', label: '无序列表' },
  { id: 'ordered-list', label: '有序列表' },
  { id: 'task-list', label: '任务列表' },
  { id: 'code-fence', label: '代码块' },
  { id: 'math-block', label: '数学块' },
  { id: 'hr', label: '分隔线' },
]

const INSERT: Item[] = [...CONVERT, { id: 'table', label: '表格' }]

const groups = computed<Group[]>(() => {
  const s = menu.value
  if (!s.open) return []
  if (s.mode === 'insert') return [{ title: '插入块', items: INSERT }]
  const out: Group[] = []
  // 表格没有合理的块级转换目标，隐藏「转换为」
  if (s.blockKind !== 'table') out.push({ title: '转换为', items: CONVERT })
  out.push({
    title: '操作',
    items: [
      { id: 'op-duplicate', label: '创建副本' },
      { id: 'op-copy', label: '复制 Markdown' },
      { id: 'op-delete', label: '删除', danger: true },
    ],
  })
  return out
})

const flat = computed<Item[]>(() => groups.value.flatMap((g) => g.items))
const activeIndex = ref(0)

watch(
  () => [menu.value.open, menu.value.mode],
  () => {
    activeIndex.value = 0
  }
)

/** 贴边翻转：菜单默认对齐块左缘、块顶下方，放不下时上翻/左翻。 */
const style = computed(() => {
  const a = menu.value.anchor
  if (!a) return { display: 'none' }
  const W = 224
  const H = flat.value.length * 30 + groups.value.length * 26 + 16
  let x = a.left
  let y = a.top
  if (x + W > window.innerWidth - 8) x = Math.max(8, a.left - W - 8)
  if (y + H > window.innerHeight - 8) y = Math.max(8, window.innerHeight - H - 8)
  return { left: `${x}px`, top: `${y}px` }
})

function run(id: string): void {
  // 先执行再关：invokeBlockMenu 依赖 open 状态（closeBlockMenu 会把它重置）
  invokeBlockMenu(id)
  closeBlockMenu()
}

function onKey(e: KeyboardEvent): void {
  if (!menu.value.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    closeBlockMenu()
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    e.stopPropagation()
    const n = flat.value.length
    if (!n) return
    activeIndex.value = (activeIndex.value + (e.key === 'ArrowDown' ? 1 : n - 1)) % n
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    const item = flat.value[activeIndex.value]
    if (item) run(item.id)
  }
}

// 捕获阶段：菜单打开时抢在编辑器 keymap 之前处理 ↑↓/Enter/Esc
watch(
  () => menu.value.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKey, true)
    else window.removeEventListener('keydown', onKey, true)
  }
)
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <Teleport to="body">
    <template v-if="menu.open">
      <div
        class="fixed inset-0 z-40"
        @mousedown.prevent="closeBlockMenu()"
        @contextmenu.prevent="closeBlockMenu()"
      />
      <div class="muse-block-menu fixed z-50" :style="style">
        <template v-for="(group, gi) in groups" :key="gi">
          <div class="muse-block-menu-group">{{ group.title }}</div>
          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            class="muse-block-menu-item"
            :class="{
              'is-active': flat.indexOf(item) === activeIndex,
              'is-danger': item.danger,
            }"
            @mouseenter="activeIndex = flat.indexOf(item)"
            @mousedown.prevent
            @click="run(item.id)"
          >
            <span>{{ item.label }}</span>
            <span v-if="item.shortcut" class="muse-block-menu-shortcut">{{ item.shortcut }}</span>
          </button>
        </template>
      </div>
    </template>
  </Teleport>
</template>
