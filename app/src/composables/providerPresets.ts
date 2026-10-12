/** Connection presets only; available models come from the provider's models endpoint. */
export interface ProviderPreset {
  id: string
  label: string
  description: string
  docsUrl?: string
  provider: { baseUrl: string }
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'magpie',
    label: 'Magpie 本地网关',
    description: '连接本机 Magpie，自动获取可用模型。默认无需 API Key；启用认证时填写网关密钥。',
    provider: { baseUrl: 'http://127.0.0.1:3425/v1' },
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek 官方 API，OpenAI Chat Completions 兼容。',
    docsUrl: 'https://api-docs.deepseek.com',
    provider: { baseUrl: 'https://api.deepseek.com/v1' },
  },
  {
    id: 'opencode-go',
    label: 'OpenCode Go',
    description: 'OpenCode Go 网关，密钥在 OpenCode Zen 控制台获取。',
    docsUrl: 'https://opencode.ai/docs/zh-cn/go/',
    provider: { baseUrl: 'https://opencode.ai/zen/go/v1' },
  },
]
