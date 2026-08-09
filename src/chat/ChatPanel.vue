<script setup lang="ts">
/**
 * 侧栏版 AI 面板：编辑器常驻主区域，这里做「写文档时的贴身助手」。
 *
 * 相对全屏 ChatView 的取舍：
 * - 会话列表收进头部下拉弹层（复用 Conversations，保留重命名/置顶/删除/分组）；
 * - 消息流 + 输入框直接复用 ChatMessages / ChatInput；
 * - 新增「引用当前文档」开关（提问时把正文快照作为 system 上下文注入）
 *   与「插入到正文」（把回答按 markdown 解析插入到光标处）。
 */
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ConversationItemType, ConversationsProps } from '@antdv-next/x'
import { Conversations, ThoughtChain } from '@antdv-next/x'
import { ChevronDown, Ellipsis, MessageSquareText, Pencil, Pin, Plus, Trash2 } from '@lucide/vue'
import { useChat } from './useChat'
import ChatMessages from './ChatMessages.vue'
import ChatInput from './ChatInput.vue'
import { setPendingDocContext, setPendingSelectionContext } from './ipcProvider'
import { useEditorSelection, type SelectionSnapshot } from '../composables/useEditorSelection'
import { useToolChain, clearChain } from './chainStore'
import type { Conversation } from './useChat'

const props = defineProps<{
  isDark: boolean
  /** 惰性取当前文档 markdown：仅在提问时调用一次，避免每键重渲染整个聊天树 */
  getDocContext: () => string
}>()

const emit = defineEmits<{
  manage: []
  /** AI 回答 → 插入到正文（App 转发给编辑器） */
  insert: [text: string]
  /** AI 回答 → 替换选中的原文（App 转发给编辑器） */
  replaceSelection: [payload: { from: number; to: number; expectedText: string; text: string }]
}>()

const chat = useChat()
const {
  conversationList,
  activeKey,
  activeConversation,
  isRequesting,
  providers,
  activeProviderName,
  activeModelId,
  reasoningAvailable,
  webSearchConfigured,
  searching,
  selectProvider,
  selectModel,
  newConversation,
  activate,
  removeConversation,
  renameConversation,
  send,
  stop,
  reload,
} = chat
// 可写开关（computed 包装解构出的 ref，供 v-model 写入 .value）
const reasoning = computed<boolean>({
  get: () => chat.reasoning.value,
  set: (value: boolean) => {
    chat.reasoning.value = value
  },
})
const webSearch = computed<boolean>({
  get: () => chat.webSearch.value,
  set: (value: boolean) => {
    chat.webSearch.value = value
  },
})
const docContext = ref(true)
// 侧边栏定位为「文档辅助」：默认引用当前文档作为上下文（可在对话选项中关闭）
const editingTools = computed<boolean>({
  get: () => chat.editingTools.value,
  set: (value: boolean) => {
    chat.editingTools.value = value
  },
})

const draft = ref('')

// ===== 选区感知：直接编辑当前文档 =====
// 编辑器里有选中文本时，显示「已选中 N 字」操作条 + 快捷动作；
// 发送时选中文本注入为上下文，并记录目标选区供回答后「替换选中」。
const { snapshot: selectionSnapshot } = useEditorSelection()
const selection = computed<SelectionSnapshot | null>(() => selectionSnapshot.value)
const targetSelection = ref<SelectionSnapshot | null>(null)

function handleSubmit(value: string): void {
  // 新一轮提问：清空上一回合的思考链
  clearChain()
  // 引用当前文档：提问时快照一次正文作为上下文（不阻塞、不入会话记录）
  if (docContext.value) {
    const ctx = props.getDocContext()
    if (ctx.trim()) setPendingDocContext(ctx)
  }
  // 选中文本：注入上下文并记录目标选区（回答完成后可「替换选中」直接落回文档）
  const sel = selection.value
  if (sel?.text.trim()) {
    setPendingSelectionContext(sel.text)
    targetSelection.value = { ...sel }
  } else {
    targetSelection.value = null
  }
  send(value)
}

/** 替换选中：把回答按 markdown 解析后替换原选区（App → MilkdownCore） */
function handleReplaceSelection(text: string): void {
  const t = targetSelection.value
  if (!t) return
  emit('replaceSelection', { from: t.from, to: t.to, expectedText: t.text, text })
  targetSelection.value = null
}

// ===== 思考链（@antdv-next/x ThoughtChain）：深度思考 + 工具调用过程 =====
const { chain } = useToolChain()
const chainItems = computed(() =>
  chain.value.map((e) => ({
    key: e.key,
    title: e.title,
    description: e.description,
    status: e.status,
    content: e.content,
    collapsible: e.kind === 'think',
  }))
)

// 切换会话时清空输入草稿 + 自动聚焦
const senderRef = ref<{ focus: () => void } | null>(null)
watch(activeKey, () => {
  draft.value = ''
  requestAnimationFrame(() => {
    senderRef.value?.focus()
  })
})

// ===== 会话切换下拉（Teleport 弹层，复用 Conversations）=====
const convOpen = ref(false)
const convStyle = ref<Record<string, string>>({})
const convRootRef = ref<HTMLElement | null>(null)
const convPanelRef = ref<HTMLElement | null>(null)

const convItems = computed<ConversationItemType[]>(() =>
  conversationList.value.map((c) => ({
    key: c.key,
    label: c.label,
    group: c.group,
    icon: h(MessageSquareText, { size: 15 }),
  }))
)

// 分组全部展开（跟随会话列表变化）
const expandedGroups = ref<string[]>([])
watch(
  () => conversationList.value,
  (list) => {
    const groups = Array.from(new Set(list.map((c) => c.group).filter(Boolean)))
    expandedGroups.value = Array.from(new Set([...expandedGroups.value, ...groups]))
  },
  { immediate: true, deep: true }
)
function handleGroupExpand(keys: string[]): void {
  expandedGroups.value = keys
}

const convMenu: ConversationsProps['menu'] = (item) => ({
  trigger: () =>
    h('button', { type: 'button', class: 'conversation-menu-trigger', 'aria-label': '对话操作' }, [
      h(Ellipsis, { size: 15 }),
    ]),
  items: [
    {
      key: 'rename',
      label: '重命名',
      icon: h(Pencil, { size: 14 }),
      onClick: () => {
        const next = window.prompt('对话名称', String(item.label ?? ''))
        if (next?.trim()) renameConversation(String(item.key), next.trim())
      },
    },
    {
      key: 'pin',
      label: item.group === '置顶' ? '取消置顶' : '置顶对话',
      icon: h(Pin, { size: 14 }),
      onClick: () => {
        const conv = conversationList.value.find((c) => c.key === item.key)
        if (!conv) return
        conv.group = conv.group === '置顶' ? '今天' : '置顶'
        if (conv.group === '置顶') {
          conversationList.value.sort(
            (a, b) => Number(b.group === '置顶') - Number(a.group === '置顶')
          )
        }
      },
    },
    { type: 'divider' },
    {
      key: 'delete',
      label: '删除对话',
      icon: h(Trash2, { size: 14 }),
      danger: true,
      onClick: () => removeConversation(String(item.key)),
    },
  ],
})

function toggleConvList(): void {
  convOpen.value ? closeConvList() : openConvList()
}
function openConvList(): void {
  const rect = convRootRef.value?.getBoundingClientRect()
  if (!rect) return
  convStyle.value = {
    top: `${rect.bottom + 8}px`,
    left: `${Math.max(8, rect.left)}px`,
    width: `${Math.min(320, Math.max(280, window.innerWidth - rect.left - 16))}px`,
    maxHeight: 'min(420px, calc(100vh - 72px))',
  }
  convOpen.value = true
}
function closeConvList(): void {
  convOpen.value = false
}
function pickConversation(key: string): void {
  activate(key)
  closeConvList()
}
function handleNewConversation(): void {
  newConversation()
  closeConvList()
}

// 点击外部 / Esc 关闭弹层
function onDocMouseDown(e: MouseEvent): void {
  if (!convOpen.value) return
  const target = e.target as Node
  if (convRootRef.value?.contains(target) || convPanelRef.value?.contains(target)) return
  closeConvList()
}
function onDocKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeConvList()
}
onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown)
  document.addEventListener('keydown', onDocKeyDown)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown)
  document.removeEventListener('keydown', onDocKeyDown)
})

const activeLabel = computed(() => activeConversation.value?.label ?? '新对话')
</script>

<template>
  <div class="chat-panel flex-1 min-h-0 flex flex-col">
    <!-- 头部：会话切换 + 新对话 -->
    <header class="shrink-0 h-12 flex items-center gap-1.5 px-3 border-b border-border-subtle">
      <div ref="convRootRef" class="min-w-0 flex-1">
        <button
          type="button"
          class="conv-trigger"
          :title="activeLabel"
          @click="toggleConvList"
        >
          <span class="conv-trigger-label truncate">{{ activeLabel }}</span>
          <ChevronDown :size="13" class="conv-trigger-chevron" :class="{ open: convOpen }" />
        </button>

        <Teleport to="body">
          <div
            v-if="convOpen"
            ref="convPanelRef"
            class="chat-panel-conv-pop"
            :style="convStyle"
          >
            <button type="button" class="conv-new-btn" @click="handleNewConversation">
              <Plus :size="14" />
              <span>新对话</span>
            </button>
            <div class="chat-panel-conv-list">
              <Conversations
                :items="convItems"
                :active-key="activeKey"
                :menu="convMenu"
                :on-active-change="pickConversation"
                @update:active-key="pickConversation"
                :groupable="{
                  collapsible: true,
                  expandedKeys: expandedGroups,
                  onExpand: handleGroupExpand,
                }"
              />
            </div>
          </div>
        </Teleport>
      </div>

      <a-tooltip title="新对话">
        <a-button
          type="text"
          shape="circle"
          size="small"
          class="!text-fg-soft"
          aria-label="新对话"
          @click="newConversation"
        >
          <template #icon><Plus :size="15" /></template>
        </a-button>
      </a-tooltip>
    </header>

    <!-- 思考链：深度思考 + 工具调用过程（@antdv-next/x ThoughtChain） -->
    <div v-if="chainItems.length" class="chain-wrap">
      <ThoughtChain :items="chainItems" line="dashed" />
    </div>

    <!-- 消息流 -->
    <ChatMessages
      :conversation="activeConversation"
      :is-requesting="isRequesting"
      :is-dark="props.isDark"
      :can-replace-selection="Boolean(targetSelection)"
      @reload="reload"
      @insert="(text: string) => emit('insert', text)"
      @replace-selection="handleReplaceSelection"
    />

    <!-- 输入 -->
    <ChatInput
      ref="senderRef"
      v-model="draft"
      :loading="isRequesting"
      :searching="searching"
      :providers="providers"
      :active-provider="activeProviderName"
      :active-model="activeModelId"
      v-model:reasoning="reasoning"
      :reasoning-available="reasoningAvailable"
      v-model:web-search="webSearch"
      :web-search-configured="webSearchConfigured"
      v-model:doc-context="docContext"
      v-model:editing-tools="editingTools"
      @update:active-provider="selectProvider"
      @update:active-model="selectModel"
      @submit="handleSubmit"
      @cancel="stop"
      @manage="emit('manage')"
    />
  </div>
</template>

<style scoped>
/* 侧栏窄屏：收紧 ChatMessages / ChatInput 的宽屏留白 */
.chat-panel :deep(.chat-messages .antd-bubble-list) {
  padding-inline: 16px;
}
.chat-panel :deep(.chat-messages .antd-bubble-list-scroll-content) {
  padding-block: 18px 10px;
}
.chat-panel :deep(.chat-footer) {
  padding: 6px 12px 12px;
}

/* ===== 思考链（ThoughtChain）：窄侧栏紧凑呈现 ===== */
.chain-wrap {
  max-height: 40%;
  overflow-y: auto;
  margin: 4px 12px 6px;
  padding: 8px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--bg-soft);
}
.chain-wrap :deep(.antd-thought-chain) {
  font-size: 12px;
}
.chain-wrap :deep(.antd-thought-chain-item) {
  padding: 2px 0;
}
.chain-wrap :deep(.antd-thought-chain-item-title) {
  font-size: 12px;
  color: var(--fg);
}
.chain-wrap :deep(.antd-thought-chain-item-description) {
  font-size: 11px;
  color: var(--fg-soft);
}
.chain-wrap :deep(.antd-thought-chain-item-content) {
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--fg-soft);
  white-space: pre-wrap;
}


/* 会话切换触发按钮 */
.conv-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-soft);
  color: var(--fg);
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease;
}
.conv-trigger:hover {
  border-color: var(--fg-soft);
  background: color-mix(in srgb, var(--bg-soft) 75%, var(--fg-soft) 10%);
}
.conv-trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conv-trigger-chevron {
  flex-shrink: 0;
  color: var(--fg-soft);
  transition: transform 160ms ease;
}
.conv-trigger-chevron.open {
  transform: rotate(180deg);
}
</style>

<!-- Teleport 到 body 的会话弹层，需全局样式 -->
<style>
.chat-panel-conv-pop {
  position: fixed;
  z-index: 1080;
  display: flex;
  flex-direction: column;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  box-shadow:
    0 10px 32px rgba(9, 9, 11, 0.16),
    0 2px 8px rgba(9, 9, 11, 0.08);
}
.conv-new-btn {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--fg);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms ease;
}
.conv-new-btn:hover {
  background: var(--bg-soft);
}
.chat-panel-conv-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-top: 4px;
}
.chat-panel-conv-list :deep(.antd-conversations) {
  padding: 0;
}
.chat-panel-conv-list :deep(.antd-conversations-item) {
  height: 34px;
  border-radius: 8px;
  padding-inline: 8px;
  margin-block: 1px;
  transition: background 120ms ease;
}
.chat-panel-conv-list :deep(.antd-conversations-item:hover) {
  background: color-mix(in srgb, var(--fg) 6%, transparent);
}
.chat-panel-conv-list :deep(.antd-conversations-item-active),
.chat-panel-conv-list :deep(.antd-conversations-item-active:hover) {
  background: color-mix(in srgb, var(--fg) 10%, transparent);
}
.chat-panel-conv-list :deep(.antd-conversations-label) {
  font-size: 13px;
  color: var(--fg);
}
.chat-panel-conv-list :deep(.antd-conversations-item-active .antd-conversations-label) {
  color: var(--fg);
  font-weight: 500;
}
.chat-panel-conv-list :deep(.antd-conversations-icon) {
  color: var(--fg-soft);
}
.chat-panel-conv-list :deep(.antd-conversations-item-active .antd-conversations-icon) {
  color: var(--fg);
}
.chat-panel-conv-list :deep(.antd-conversations-item-active .conversation-menu-trigger) {
  color: var(--fg);
}
.chat-panel-conv-list :deep(.antd-conversations-group-label) {
  font-size: 11px;
  color: var(--fg-soft);
  font-weight: 500;
  padding: 10px 8px 4px;
}
.chat-panel-conv-list :deep(.antd-conversations-group-collapse-trigger) {
  color: var(--fg-soft);
}
.conversation-menu-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--fg-soft);
  cursor: pointer;
}
.conversation-menu-trigger:hover {
  background: var(--border-subtle);
  color: var(--fg);
}
</style>
