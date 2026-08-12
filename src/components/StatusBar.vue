<script setup lang="ts">
/**
 * 整窗底部工具条（Zed 式）：左边收起侧栏 + 状态信息（文档位置 + 字数统计），
 * 右边一排 icon 工具（搜索 / AI / 打开文件夹 / 主题 / 设置），左右 justify-between。
 * 搜索 / AI 点击打开或切换右栏（已激活时再点收起）；顶栏与右栏的标签切换已移除。
 */
import {
  Folder,
  FolderOpen,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
} from '@lucide/vue'
import type { DocStats } from '../composables/useDocStats'

defineProps<{
  stats: DocStats
  /** 文档位置：工作区内显示相对路径，外部文件显示完整路径，未命名为空 */
  location: string
  path: string | null
  railCollapsed: boolean
  aiOpen: boolean
  searchOpen: boolean
  isDark: boolean
  /** 当前主题名（tooltip 展示） */
  themeName: string
}>()

const emit = defineEmits<{
  'toggle-search': []
  'toggle-ai': []
  'toggle-rail': []
  'toggle-theme': []
  settings: []
  'open-folder': []
}>()
</script>

<template>
  <footer
    class="h-9 shrink-0 flex items-center justify-between gap-3 px-2 border-t border-border-subtle bg-bg select-none"
  >
    <!-- 左：收起侧栏 + 状态信息 -->
    <div class="flex items-center gap-2 min-w-0">
      <a-tooltip :title="railCollapsed ? '展开侧栏' : '收起侧栏'">
        <button
          type="button"
          class="rail-icon-btn"
          aria-label="收起或展开左侧栏"
          @click="emit('toggle-rail')"
        >
          <PanelLeftOpen v-if="railCollapsed" :size="14" />
          <PanelLeftClose v-else :size="14" />
        </button>
      </a-tooltip>

      <div class="w-px h-4 bg-border-subtle mx-0.5 shrink-0" />

      <span class="flex items-center gap-1.5 min-w-0 text-[11.5px] text-fg-dim" :title="path ?? ''">
        <Folder v-if="location" :size="12" class="shrink-0" />
        <span class="truncate">{{ location }}</span>
      </span>
      <span class="tabular-nums flex items-center gap-3 text-[11.5px] text-fg-dim shrink-0">
        <span>{{ stats.words }} 字</span>
        <span>{{ stats.chars }} 字符</span>
        <span>{{ stats.lines }} 行</span>
      </span>
    </div>

    <!-- 右：工具 icon 按钮 -->
    <div class="flex items-center gap-0.5 shrink-0">
      <a-tooltip :title="searchOpen ? '收起搜索' : '搜索 (⌘F)'">
        <button
          type="button"
          class="rail-icon-btn"
          :class="{ on: searchOpen }"
          aria-label="搜索"
          @click="emit('toggle-search')"
        >
          <Search :size="14" />
        </button>
      </a-tooltip>
      <a-tooltip :title="aiOpen ? '收起 AI 栏' : '打开 AI 栏'">
        <button
          type="button"
          class="rail-icon-btn"
          :class="{ on: aiOpen }"
          aria-label="AI 助手"
          @click="emit('toggle-ai')"
        >
          <Sparkles :size="14" />
        </button>
      </a-tooltip>
      <a-tooltip title="打开文件夹">
        <button type="button" class="rail-icon-btn" aria-label="打开文件夹" @click="emit('open-folder')">
          <FolderOpen :size="14" />
        </button>
      </a-tooltip>

      <div class="w-px h-4 bg-border-subtle mx-1.5 shrink-0" />

      <a-tooltip :title="`${themeName} · 点击切换明暗`">
        <button
          type="button"
          class="rail-icon-btn"
          aria-label="切换主题"
          @click="emit('toggle-theme')"
        >
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
