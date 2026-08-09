import { ref, watch } from 'vue'

export interface ProviderModel {
  id: string
  name?: string
  reasoning?: boolean
  input?: string[]
  contextWindow?: number
  maxTokens?: number
}

export interface ProviderConfig {
  /** 显示名称（唯一，取代终端式 providerId） */
  name: string
  baseUrl?: string
  /** 明文 API Key（GUI 应用内直接输入；用于联通测试与后续请求） */
  apiKey?: string
  models: ProviderModel[]
}

export interface Settings {
  fontSize: number
  lineHeight: number
  /** 已配置的模型供应商（AI 对话用，未来接入真实 API） */
  providers: ProviderConfig[]
  /** 当前选中的供应商 / 模型 */
  activeProvider?: string
  activeModel?: string
  /** 联网搜索（Brave Search API）密钥 */
  searchApiKey?: string
}

const STORAGE_KEY = 'muse:settings'

const DEFAULTS: Settings = {
  fontSize: 16,
  lineHeight: 1.7,
  providers: [],
}

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return {
      ...DEFAULTS,
      ...saved,
      // 旧版以 id 存储（pim 式 providerId），迁移为 name；无 id/name 的丢弃
      providers: Array.isArray(saved.providers)
        ? saved.providers
            .map((p: { name?: string; id?: string; baseUrl?: string; apiKey?: string; models?: ProviderModel[] }) => {
              const name = (p.name ?? p.id ?? '').trim()
              if (!name) return null
              return {
                name,
                baseUrl: p.baseUrl,
                apiKey: p.apiKey,
                models: Array.isArray(p.models) ? p.models : [],
              }
            })
            .filter((p: ProviderConfig | null): p is ProviderConfig => p !== null)
        : [],
    }
  } catch {
    return { ...DEFAULTS }
  }
}

const settings = ref<Settings>(load())

function apply(): void {
  const s = settings.value
  const root = document.documentElement
  root.style.setProperty('--editor-font-size', `${s.fontSize}px`)
  root.style.setProperty('--editor-line-height', String(s.lineHeight))
}

apply()

watch(settings, (s) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  apply()
}, { deep: true })

const PROVIDER_NAME_RE = /^[^\s][\s\S]{0,31}$/

export function useSettings() {
  /** 新增供应商；名称为空、超长或重复时返回 false */
  function addProvider(provider: ProviderConfig): boolean {
    const name = provider.name.trim()
    if (!name || name.length > 32) return false
    if (settings.value.providers.some((p) => p.name === name)) return false
    provider.name = name
    settings.value.providers.push(provider)
    settings.value.activeProvider ??= name
    return true
  }

  function removeProvider(name: string): void {
    settings.value.providers = settings.value.providers.filter((p) => p.name !== name)
    if (settings.value.activeProvider === name) {
      settings.value.activeProvider = settings.value.providers[0]?.name
      settings.value.activeModel = ''
    }
  }

  /** 切换当前供应商；模型随之重置（不同供应商模型不通用） */
  function selectProvider(name: string): void {
    if (settings.value.providers.some((p) => p.name === name)) {
      settings.value.activeProvider = name
      settings.value.activeModel = ''
    }
  }

  /** 切换当前模型（供应商维度，交由 Chat 校验归属） */
  function selectModel(id: string): void {
    settings.value.activeModel = id
  }

  return {
    settings,
    setFontSize: (v: number) => {
      settings.value.fontSize = v
    },
    setLineHeight: (v: number) => {
      settings.value.lineHeight = v
    },
    addProvider,
    removeProvider,
    selectProvider,
    selectModel,
  }
}
