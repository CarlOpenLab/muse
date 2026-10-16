<script setup lang="ts">
/**
 * AI 改动提议确认卡片：展示 diff，用户点「应用」才写入文档。
 * 这是「AI 提议 → 人工确认」交互的落地端：AI 不再直接改正文。
 */
import { computed, ref } from 'vue'
import { dismissProposal, setProposalStatus, type Proposal } from './proposals'
import { dispatchApplyProposal } from '../composables/useEditorControl'

const props = defineProps<{ proposal: Proposal }>()

const busy = ref(false)
const expanded = ref(false)
const MAX_COLLAPSED = 14

const changed = computed(() => props.proposal.diff.filter((l) => l.type !== 'same'))
const shown = computed(() =>
  expanded.value ? changed.value : changed.value.slice(0, MAX_COLLAPSED)
)
const hiddenCount = computed(() => Math.max(0, changed.value.length - shown.value.length))
const statText = computed(() => {
  const s = props.proposal.stats
  const parts: string[] = []
  if (s.added) parts.push(`+${s.added}`)
  if (s.removed) parts.push(`-${s.removed}`)
  return parts.join(' ') || '无变化'
})

async function apply(): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    const res = await dispatchApplyProposal({
      from: props.proposal.from,
      to: props.proposal.to,
      expectedText: props.proposal.expectedText,
      text: props.proposal.text,
    })
    if (res.ok) setProposalStatus(props.proposal.id, 'applied')
    else setProposalStatus(props.proposal.id, 'pending', res.message)
  } finally {
    busy.value = false
  }
}

function discard(): void {
  setProposalStatus(props.proposal.id, 'discarded')
  dismissProposal(props.proposal.id)
}
</script>

<template>
  <div class="proposal-card" :class="{ stale: !!proposal.error }">
    <div class="pc-head">
      <span class="pc-title" :title="proposal.title">{{ proposal.title }}</span>
      <span class="pc-stat">{{ statText }}</span>
    </div>
    <div v-if="proposal.detail" class="pc-detail">{{ proposal.detail }}</div>

    <div class="pc-diff">
      <div v-for="(line, i) in shown" :key="i" class="pc-line" :class="line.type">
        <span class="pc-sign">{{ line.type === 'add' ? '+' : '-' }}</span>
        <span class="pc-text">
          <template v-if="line.segments && line.segments.length">
            <span
              v-for="(seg, j) in line.segments"
              :key="j"
              :class="'seg-' + seg.type"
            >{{ seg.text }}</span>
          </template>
          <template v-else>{{ line.text || ' ' }}</template>
        </span>
      </div>
      <div v-if="!changed.length" class="pc-empty">内容没有实际变化</div>
    </div>

    <button v-if="hiddenCount" type="button" class="pc-more" @click="expanded = !expanded">
      {{ expanded ? '收起' : `展开其余 ${hiddenCount} 行` }}
    </button>

    <div v-if="proposal.error" class="pc-error">{{ proposal.error }}</div>

    <div class="pc-actions">
      <button type="button" class="pc-btn primary" :disabled="busy" @click="apply">
        {{ busy ? '应用中…' : '应用' }}
      </button>
      <button type="button" class="pc-btn" :disabled="busy" @click="discard">放弃</button>
    </div>
  </div>
</template>

<style scoped>
.proposal-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-elev);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.proposal-card.stale {
  border-color: rgba(239, 68, 68, 0.5);
}
.pc-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.pc-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pc-stat {
  flex: none;
  font-size: 11px;
  color: var(--fg-soft);
  font-variant-numeric: tabular-nums;
}
.pc-detail {
  font-size: 12px;
  color: var(--fg-soft);
  line-height: 1.5;
}
.pc-diff {
  max-height: 220px;
  overflow: auto;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--code-bg);
  padding: 4px 6px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11.5px;
  line-height: 1.55;
}
.pc-line {
  display: flex;
  gap: 6px;
  white-space: pre-wrap;
  word-break: break-word;
}
.pc-line.add {
  background: rgba(34, 197, 94, 0.1);
}
.pc-line.del {
  background: rgba(239, 68, 68, 0.09);
}
.pc-sign {
  flex: none;
  width: 8px;
  color: var(--fg-dim);
  user-select: none;
}
.pc-text {
  flex: 1;
  min-width: 0;
}
/* 行内词级高亮 */
.seg-add {
  background: rgba(34, 197, 94, 0.28);
  border-radius: 2px;
}
.seg-del {
  background: rgba(239, 68, 68, 0.24);
  text-decoration: line-through;
  border-radius: 2px;
}
.pc-empty {
  color: var(--fg-ghost);
  font-size: 11.5px;
}
.pc-more {
  align-self: flex-start;
  font-size: 11.5px;
  color: var(--fg-soft);
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
.pc-more:hover {
  color: var(--fg);
}
.pc-error {
  font-size: 11.5px;
  color: #ef4444;
}
.pc-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}
.pc-btn {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-strong);
  background: var(--bg);
  color: var(--fg-soft);
  cursor: pointer;
}
.pc-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--fg);
}
.pc-btn.primary {
  background: var(--accent);
  color: var(--bg);
  border-color: var(--accent);
  font-weight: 500;
}
.pc-btn:disabled {
  opacity: 0.55;
  cursor: default;
}
</style>