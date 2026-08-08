<script setup lang="ts">
import { Feather, FilePlus, FolderOpen, FileText } from '@lucide/vue'

defineProps<{ recent: string[] }>()
const emit = defineEmits<{ new: []; open: []; 'open-recent': [path: string] }>()

// 渲染进程无 node:path，自备 basename
function basename(p: string): string {
  return p.split(/[\\/]/).pop() || p
}
</script>

<template>
  <div class="entry-screen">
    <div class="entry-inner">
      <div class="entry-logo"><Feather :size="28" /></div>
      <h1 class="entry-title">md-ai</h1>
      <p class="entry-subtitle">一个 Typora 式的 Markdown 编辑器，所见即所得。</p>

      <div class="entry-actions">
        <button class="entry-btn primary" @click="emit('new')">
          <FilePlus :size="16" />
          <span>新建文件</span>
        </button>
        <button class="entry-btn" @click="emit('open')">
          <FolderOpen :size="16" />
          <span>打开文件</span>
        </button>
      </div>

      <div v-if="recent.length" class="entry-recent">
        <div class="entry-recent-title">最近打开</div>
        <ul>
          <li
            v-for="p in recent"
            :key="p"
            class="entry-recent-item"
            :title="p"
            @click="emit('open-recent', p)"
          >
            <FileText :size="14" />
            <span class="truncate">{{ basename(p) }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.entry-screen {
  flex: 1 1 0%;
  min-height: 0;
  display: flex;
  overflow: auto;
  padding: 24px;
}

.entry-inner {
  margin: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 360px;
  width: 100%;
}

.entry-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  margin-bottom: 16px;
  border-radius: 16px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.entry-title {
  margin: 0 0 6px;
  font-size: 22px;
  font-weight: 600;
  color: var(--fg);
}

.entry-subtitle {
  margin: 0 0 24px;
  font-size: 13px;
  color: var(--fg-soft);
  line-height: 1.6;
}

.entry-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 28px;
}

.entry-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.entry-btn:hover {
  background: var(--bg-soft);
  border-color: var(--accent);
}

.entry-btn.primary {
  color: var(--bg);
  background: var(--accent);
  border-color: var(--accent);
}

.entry-btn.primary:hover {
  background: color-mix(in srgb, var(--accent) 88%, #000);
}

.entry-recent {
  width: 100%;
  text-align: left;
}

.entry-recent-title {
  font-size: 11px;
  font-weight: 500;
  color: var(--fg-soft);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
  padding: 0 4px;
}

.entry-recent ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.entry-recent-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  font-size: 13px;
  color: var(--fg-soft);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.entry-recent-item:hover {
  background: var(--bg-soft);
  color: var(--fg);
}
</style>
