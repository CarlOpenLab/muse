/**
 * AI Chat 会话管理：conversations + useXChat 流式请求 + localStorage 持久化。
 *
 * 数据流：每个会话各自保存 messages（DefaultMessageInfo<XModelMessage>[]），
 * useXChat 的 messages 是"当前活跃缓冲区"，切换会话时用 setMessages 换入换出。
 */
import { computed, ref, watch } from 'vue'
import { OpenAIChatProvider, useXChat, XRequest } from '@antdv-next/x-sdk'
import type {
  DefaultMessageInfo,
  MessageInfo,
  XModelMessage,
  XModelParams,
  XModelResponse,
} from '@antdv-next/x-sdk'
import { mockChatFetch } from './mockProvider'

export interface Conversation {
  key: string
  label: string
  group: string
  messages: DefaultMessageInfo<XModelMessage>[]
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'muse:chat:v1'

interface PersistedChat {
  list: Conversation[]
  activeKey: string
}

function loadPersisted(): PersistedChat | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedChat
    if (!Array.isArray(parsed.list)) return null
    return parsed
  } catch {
    return null
  }
}

function persist(list: Conversation[], activeKey: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ list, activeKey }))
  } catch {
    /* 存储满/隐私模式等场景静默失败 */
  }
}

function createConversation(label = '新对话'): Conversation {
  const now = Date.now()
  return {
    key: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    group: '今天',
    messages: [],
    createdAt: now,
    updatedAt: now,
  }
}

function previewLabel(content: string, max = 18): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) return '新对话'
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized
}

export function useChat() {
  // ===== 会话列表 =====
  const conversationList = ref<Conversation[]>([])
  const activeKey = ref('')
  const isHydrated = ref(false)

  const persisted = loadPersisted()
  if (persisted) {
    conversationList.value = persisted.list
    activeKey.value = persisted.activeKey
  }

  const activeConversation = computed<Conversation | undefined>(() =>
    conversationList.value.find((c) => c.key === activeKey.value)
  )
  const activeMessages = computed<DefaultMessageInfo<XModelMessage>[]>(
    () => activeConversation.value?.messages ?? []
  )
  const showWelcome = computed(() => activeMessages.value.length === 0)

  // ===== Provider（本地 mock 流式，未来替换为真实 API） =====
  const provider = new OpenAIChatProvider<XModelMessage, XModelParams, XModelResponse>({
    request: XRequest<XModelParams, XModelResponse>('mock://local', {
      manual: true,
      params: { stream: true } as XModelParams,
      fetch: mockChatFetch,
      streamTimeout: 120_000,
    }),
  })

  const { onRequest, messages, setMessages, isRequesting, abort, onReload } = useXChat<
    XModelMessage,
    XModelMessage,
    XModelParams,
    XModelResponse
  >({
    provider,
    defaultMessages: () => activeConversation.value?.messages ?? [],
    requestPlaceholder: () => ({ role: 'assistant', content: '思考中…' }),
    requestFallback: (_, { error }) => {
      if (error?.name === 'AbortError') {
        return { role: 'assistant', content: '已停止生成' }
      }
      return { role: 'assistant', content: '请求失败，请重试' }
    },
  })

  // 流式/消息变化 → 同步回当前会话并持久化
  watch(
    messages,
    (msgs) => {
      const conv = activeConversation.value
      if (conv) {
        conv.messages = msgs
        conv.updatedAt = Date.now()
      }
      persist(conversationList.value, activeKey.value)
    },
    { deep: true }
  )

  // ===== 会话操作 =====
  function newConversation(): void {
    const conv = createConversation()
    conversationList.value.unshift(conv)
    activeKey.value = conv.key
    setMessages([])
    persist(conversationList.value, activeKey.value)
  }

  function activate(key: string): void {
    if (key === activeKey.value) return
    const conv = conversationList.value.find((c) => c.key === key)
    if (!conv) return
    activeKey.value = key
    setMessages(conv.messages as MessageInfo<XModelMessage>[])
    persist(conversationList.value, activeKey.value)
  }

  function removeConversation(key: string): void {
    conversationList.value = conversationList.value.filter((c) => c.key !== key)
    if (activeKey.value === key) {
      activeKey.value = ''
      setMessages([])
    }
    persist(conversationList.value, activeKey.value)
  }

  function renameConversation(key: string, label: string): void {
    const conv = conversationList.value.find((c) => c.key === key)
    if (conv && label.trim()) {
      conv.label = label.trim()
      persist(conversationList.value, activeKey.value)
    }
  }

  // ===== 发送 / 停止 / 重新生成 =====
  function send(text: string): void {
    const content = text.trim()
    if (!content || isRequesting.value) return

    // 草稿态首次发送时创建会话
    if (!activeKey.value) {
      const conv = createConversation()
      conversationList.value.unshift(conv)
      activeKey.value = conv.key
    }
    const conv = activeConversation.value
    if (!conv) return

    // 未命名会话：用首条用户消息做标题
    if (conv.label === '新对话') conv.label = previewLabel(content)

    setMessages(conv.messages as MessageInfo<XModelMessage>[])
    onRequest({
      messages: [{ role: 'user', content }],
      model: 'muse-mock',
    })
    persist(conversationList.value, activeKey.value)
  }

  function stop(): void {
    abort()
  }

  function reload(messageId: string | number): void {
    if (isRequesting.value) return
    setMessages(activeConversation.value?.messages as MessageInfo<XModelMessage>[])
    onReload(messageId, { model: 'muse-mock' })
  }

  watch(isRequesting, () => persist(conversationList.value, activeKey.value))

  return {
    conversationList,
    activeKey,
    activeConversation,
    activeMessages,
    showWelcome,
    isRequesting,
    isHydrated,
    newConversation,
    activate,
    removeConversation,
    renameConversation,
    send,
    stop,
    reload,
  }
}

export type UseChat = ReturnType<typeof useChat>
