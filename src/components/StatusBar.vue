<script setup lang="ts">
/**
 * 整窗底部工具条（Zed 式）：左边状态信息（文档位置 + 字数统计），
 * 右边一排 icon 工具（新建 / 搜索 / AI / 打开文件 / 主题 / 设置），左右 justify-between。
 * 搜索 / AI 点击打开或切换右栏（已激活时再点收起）；顶栏与右栏的标签切换已移除。
 */
import {
  FileUp,
  Moon,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  SquarePen,
  Sun,
} from '@lucide/vue'
import type { DocStats } from '../composables/useDocStats'

defineProps<{
  stats: DocStats
  aiOpen: boolean
  searchOpen: boolean
  isDark: boolean
  /** 当前主题名（tooltip 展示） */
  themeName: string
}>()

const emit = defineEmits<{
  'new': []
  'toggle-search': []
  'toggle-ai': []
  'toggle-theme': []
  settings: []
  'open-file': []
}>()
</script>

<template>
  <footer
    class="h-9 shrink-0 flex items-center justify-between gap-3 px-4 border-t border-border-subtle bg-bg select-none">
    <!-- 左：字数统计 -->
    <div class="flex items-center gap-3 min-w-0 shrink-0 pl-1">
      <span class="tabular-nums flex items-center gap-3 text-[11.5px] text-fg-dim shrink-0">
        <span>{{ stats.words }} 字</span>
        <span>{{ stats.chars }} 字符</span>
        <span>{{ stats.lines }} 行</span>
      </span>
    </div>

    <!-- 右：工具 icon 按钮 -->
    <div class="flex items-center gap-0.5 shrink-0 pr-1">
      <a-tooltip title="新建文档">
        <button type="button" class="rail-icon-btn" aria-label="新建文档" @click="emit('new')">
          <SquarePen :size="14" />
        </button>
      </a-tooltip>

      <div class="w-px h-4 bg-border-subtle mx-1.5 shrink-0" />

      <a-tooltip :title="searchOpen ? '收起搜索' : '搜索 (⌘F)'">
        <button type="button" class="rail-icon-btn" :class="{ on: searchOpen }" aria-label="搜索"
          @click="emit('toggle-search')">
          <Search :size="14" />
        </button>
      </a-tooltip>
      <a-tooltip :title="aiOpen ? '收起 AI 栏' : '打开 AI 栏'">
        <button type="button" class="rail-icon-btn" :class="{ on: aiOpen }" aria-label="AI 助手"
          @click="emit('toggle-ai')">
          <Sparkles :size="14" />
        </button>
      </a-tooltip>
      <a-tooltip title="打开文件">
        <button type="button" class="rail-icon-btn" aria-label="打开文件" @click="emit('open-file')">
          <FileUp :size="14" />
        </button>
      </a-tooltip>

      <div class="w-px h-4 bg-border-subtle mx-1.5 shrink-0" />

      <a-tooltip :title="`${themeName} · 点击切换明暗`">
        <button type="button" class="rail-icon-btn" aria-label="切换主题" @click="emit('toggle-theme')">
          <Sun v-if="isDark" :size="14" />
          <Moon v-else :size="14" />
        </button>
      </a-tooltip>
      <a-tooltip title="设置">
        <button type="button" class="rail-icon-btn" aria-label="设置" @click="emit('settings')">
          <SettingsIcon :size="14" />
        </button>
      </a-tooltip>
    </div>
  </footer>
</template>
