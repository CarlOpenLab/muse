import { ref } from 'vue'

/**
 * AI 回合的思考链数据（模块级单例）。
 *
 * agent loop（ipcProvider）在请求过程中写入：
 * - 深度思考（reasoning_content delta 流式累积）→ think 节点
 * - 工具调用（执行前 loading / 执行后 success|error）→ tool 节点
 * ChatPanel 用 @antdv-next/x 的 ThoughtChain 组件渲染。
 * 每轮新提问开始时 clearChain()。
 */

export type ChainStatus = 'loading' | 'success' | 'error' | 'abort'

export interface ChainEntry {
  key: string
  kind: 'think' | 'tool'
  status: ChainStatus
  /** 节点标题（如「深度思考」「全文替换」） */
  title: string
  /** 标题旁描述（如「已替换 2 处」） */
  description?: string
  /** 可折叠内容（思考文本 / 工具详情） */
  content?: string
}

const chain = ref<ChainEntry[]>([])

export function useToolChain() {
  return { chain }
}

export function pushChainEntry(entry: Omit<ChainEntry, 'key'>): string {
  const key = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  chain.value = [...chain.value, { ...entry, key }]
  return key
}

export function updateChainEntry(key: string, patch: Partial<Omit<ChainEntry, 'key'>>): void {
  chain.value = chain.value.map((e) => (e.key === key ? { ...e, ...patch } : e))
}

export function clearChain(): void {
  chain.value = []
}
