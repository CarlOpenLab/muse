/**
 * 模型供应商预设：参考 pim（Pi Coding Agent）的预设数据与交互。
 *
 * 预设只是起点：连接信息（Base URL / 模型清单）是稳定部分，
 * 模型 ID 会随厂商调整，导入后请对照官方文档核对。
 * API Key 由用户在向导里输入并做联通测试，预设不携带密钥。
 */
import type { ProviderModel } from './useSettings'

export interface ProviderPreset {
  /** 预设 id（仅用于选择，不写入配置） */
  id: string
  label: string
  description: string
  docsUrl?: string
  provider: {
    baseUrl?: string
  }
  models: ProviderModel[]
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek 官方 API，OpenAI Chat Completions 兼容。',
    docsUrl: 'https://api-docs.deepseek.com',
    provider: {
      baseUrl: 'https://api.deepseek.com',
    },
    models: [
      {
        id: 'deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        contextWindow: 1000000,
        maxTokens: 384000,
        input: ['text'],
        reasoning: true,
      },
      {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        contextWindow: 1000000,
        maxTokens: 384000,
        input: ['text'],
        reasoning: true,
      },
    ],
  },
  {
    id: 'opencode-go',
    label: 'OpenCode Go',
    description:
      'OpenCode 的低成本开源编程模型订阅服务（首月 $5，之后 $10/月）。统一网关聚合多家开源模型；密钥在 OpenCode Zen 控制台获取。',
    docsUrl: 'https://opencode.ai/docs/zh-cn/go/',
    provider: {
      baseUrl: 'https://opencode.ai/zen/go/v1',
    },
    models: [
      { id: 'grok-4.5', name: 'Grok 4.5', reasoning: true, input: ['text'] },
      { id: 'glm-5.2', name: 'GLM-5.2', reasoning: true, input: ['text'] },
      { id: 'glm-5.1', name: 'GLM-5.1', reasoning: true, input: ['text'] },
      { id: 'kimi-k3', name: 'Kimi K3', reasoning: true, input: ['text'] },
      { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', reasoning: true, input: ['text'] },
      { id: 'kimi-k2.6', name: 'Kimi K2.6', reasoning: true, input: ['text'] },
      {
        id: 'deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        contextWindow: 1000000,
        maxTokens: 384000,
        reasoning: true,
        input: ['text'],
      },
      {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        contextWindow: 1000000,
        maxTokens: 384000,
        reasoning: true,
        input: ['text'],
      },
      { id: 'mimo-v2.5', name: 'MiMo V2.5', reasoning: true, input: ['text'] },
      { id: 'mimo-v2.5-pro', name: 'MiMo V2.5 Pro', reasoning: true, input: ['text'] },
      { id: 'hy3', name: 'Hy3', reasoning: true, input: ['text'] },
      {
        id: 'gpt-5.6-luna',
        name: 'GPT 5.6 Luna',
        contextWindow: 272000,
        reasoning: true,
        input: ['text'],
      },
      { id: 'minimax-m3', name: 'MiniMax M3', reasoning: true, input: ['text'] },
      { id: 'minimax-m2.7', name: 'MiniMax M2.7', reasoning: true, input: ['text'] },
      { id: 'minimax-m2.5', name: 'MiniMax M2.5', reasoning: true, input: ['text'] },
      { id: 'qwen3.8-max', name: 'Qwen3.8 Max', reasoning: true, input: ['text'] },
      { id: 'qwen3.7-max', name: 'Qwen3.7 Max', reasoning: true, input: ['text'] },
      { id: 'qwen3.7-plus', name: 'Qwen3.7 Plus', reasoning: true, input: ['text'] },
      { id: 'qwen3.6-plus', name: 'Qwen3.6 Plus', reasoning: true, input: ['text'] },
    ],
  },
]
