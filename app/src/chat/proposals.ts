/**
 * AI 改动提议（proposal）状态。
 *
 * AI 不再直接落笔：写类工具把「打算怎么改」算出来存成一条 proposal，
 * 由确认卡片展示 diff，用户点「应用」才真正写入编辑器（走 apply-proposal 动作）。
 *
 * 模块级单例 ref：侧栏卡片与编辑器两侧共读同一份状态。
 */
import { computed, ref } from 'vue'
import { summarizeDiff, type DiffLine, type DiffSummary } from './agent/diff'

export interface Proposal {
  id: string
  /** 卡片标题，如「改写 章节「背景」」 */
  title: string
  /** 一句话说明（AI 的 summary） */
  detail: string
  /** 应用时提交给编辑器的目标区间（ProseMirror 位置） */
  from: number
  to: number
  /** 提议时的原文快照，应用前做一致性校验 */
  expectedText: string
  /** 新内容（markdown，按语法解析后落地） */
  text: string
  oldText: string
  newText: string
  diff: DiffLine[]
  stats: DiffSummary
  status: 'pending' | 'applied' | 'discarded'
  /** 应用失败时的原因（如文档已变动） */
  error?: string
  createdAt: number
}

export type NewProposal = Omit<Proposal, 'id' | 'status' | 'createdAt' | 'stats'> & {
  stats?: DiffSummary
}

const proposals = ref<Proposal[]>([])
let counter = 0

export function addProposal(input: NewProposal): Proposal {
  const proposal: Proposal = {
    ...input,
    stats: input.stats ?? summarizeDiff(input.diff),
    id: `p${++counter}_${Date.now().toString(36)}`,
    status: 'pending',
    createdAt: Date.now(),
  }
  proposals.value = [...proposals.value, proposal]
  return proposal
}

export function setProposalStatus(id: string, status: Proposal['status'], error?: string): void {
  proposals.value = proposals.value.map((p) => (p.id === id ? { ...p, status, error } : p))
}

export function dismissProposal(id: string): void {
  proposals.value = proposals.value.filter((p) => p.id !== id)
}

export function clearProposals(): void {
  proposals.value = []
}

/** 同一位置只保留最新一条待确认提议，避免反复改同一处堆积出多条卡片。 */
export function dedupeProposals(): void {
  const seen = new Set<string>()
  const out: Proposal[] = []
  for (let i = proposals.value.length - 1; i >= 0; i--) {
    const p = proposals.value[i]
    if (p.status !== 'pending') {
      out.unshift(p)
      continue
    }
    const key = `${p.from}:${p.to}`
    if (seen.has(key)) continue
    seen.add(key)
    out.unshift(p)
  }
  if (out.length !== proposals.value.length) proposals.value = out
}

export function useProposals() {
  const pending = computed(() => proposals.value.filter((p) => p.status === 'pending'))
  const resolved = computed(() => proposals.value.filter((p) => p.status !== 'pending'))
  return { proposals, pending, resolved }
}