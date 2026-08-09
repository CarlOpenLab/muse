/**
 * AI Chat 会话管理：conversations + useXChat 流式请求 + localStorage 持久化。
 *
 * 数据流：每个会话各自保存 messages（DefaultMessageInfo<XModelMessage>[]），
 * useXChat 的 messages 是"当前活跃缓冲区"，切换会话时用 setMessages 换入换出。
 *
 * 请求链路：设置里配置的供应商（baseUrl/apiKey）经主进程 IPC 发起真实流式请求
 * （见 ipcProvider.ts），未配置供应商时回退本地 mock 演示。
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
import { useSettings, type ProviderConfig } from '../composables/useSettings'
import { ipcChatFetch, setChatConnection, setPendingSearchContext } from './ipcProvider'
import type { WebSearchResponse } from './ipcProvider'

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

/** 搜索结果 -> system 上下文（供模型参考，引用时附链接） */
function formatSearchContext(query: string, results: WebSearchResponse['results']): string {
  const lines = (results ?? []).map(
    (r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description || '（无摘要）'}`
  )
  return [
    `以下是针对「${query}」的联网搜索结果，请基于这些资料回答；引用具体信息时附上对应链接。`,
    '',
    lines.join('\n\n'),
  ].join('\n')
}

export function useChat() {
  const { settings, selectProvider, selectModel } = useSettings()

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

  // ===== 供应商 / 模型选择（写入 settings，跨会话保留）=====
  const providers = computed<ProviderConfig[]>(() => settings.value.providers)
  const activeProviderName = computed(
    () => settings.value.activeProvider || providers.value[0]?.name || ''
  )
  const activeProvider = computed(() =>
    providers.value.find((p) => p.name === activeProviderName.value)
  )
  const activeModelId = computed(
    () => settings.value.activeModel || activeProvider.value?.models[0]?.id || ''
  )
  const activeModel = computed(() =>
    activeProvider.value?.models.find((m) => m.id === activeModelId.value)
  )
  const reasoningAvailable = computed(() => Boolean(activeModel.value?.reasoning))
  const webSearchConfigured = computed(() => Boolean(settings.value.searchApiKey?.trim()))

  // 对话开关
  const reasoning = ref(false)
  const webSearch = ref(false)
  const searching = ref(false)

  // 供应商/模型变化 -> 同步主进程请求连接
  watch(
    activeProvider,
    (p) => {
      setChatConnection(p ? { baseUrl: p.baseUrl ?? '', apiKey: p.apiKey } : null)
    },
    { immediate: true }
  )

  // ===== Provider（真实请求走主进程 IPC；无供应商时回退本地 mock）=====
  const provider = new OpenAIChatProvider<XModelMessage, XModelParams, XModelResponse>({
    request: XRequest<XModelParams, XModelResponse>('openai://chat', {
      manual: true,
      params: { stream: true } as XModelParams,
      fetch: ipcChatFetch,
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
      const message = error instanceof Error ? error.message : ''
      return {
        role: 'assistant',
        content: message ? `请求失败：${message}` : '请求失败，请重试',
      }
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

  // ===== 请求参数（模型 + 深度思考）=====
  function buildParams(): Partial<XModelParams> {
    return {
      model: activeProvider.value ? activeModelId.value : 'muse-mock',
      ...(reasoning.value && reasoningAvailable.value ? { reasoning_effort: 'high' } : {}),
    }
  }

  // ===== 发送 / 停止 / 重新生成 =====
  async function send(text: string): Promise<void> {
    const content = text.trim()
    if (!content || isRequesting.value || searching.value) return

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

    // 联网搜索：先取结果，再以 system 上下文注入请求（不入会话记录，不阻塞失败）
    if (webSearch.value && webSearchConfigured.value) {
      searching.value = true
      try {
        const res = (await window.muse?.invoke('ai:web-search', {
          query: content,
          apiKey: settings.value.searchApiKey,
        })) as WebSearchResponse | undefined
        if (res?.ok && res.results?.length) {
          setPendingSearchContext(formatSearchContext(content, res.results))
        }
      } catch {
        /* 搜索失败不阻塞对话，直接走普通请求 */
      } finally {
        searching.value = false
      }
    }

    onRequest({
      messages: [{ role: 'user', content }],
      ...buildParams(),
    })
    persist(conversationList.value, activeKey.value)
  }

  function stop(): void {
    abort()
  }

  function reload(messageId: string | number): void {
    if (isRequesting.value) return
    setMessages(activeConversation.value?.messages as MessageInfo<XModelMessage>[])
    onReload(messageId, buildParams())
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
    providers,
    activeProviderName,
    activeModelId,
    reasoningAvailable,
    webSearchConfigured,
    reasoning,
    webSearch,
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
  }
}

export type UseChat = ReturnType<typeof useChat>
