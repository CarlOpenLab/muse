<script setup lang="ts">
/**
 * 整窗底部工具条（Zed 式）：左边收起侧栏 + 状态信息（文档位置 + 字数统计），
 * 右边一排 icon 工具（搜索 / 打开文件夹 / AI 栏开关 / 主题 / 设置），
 * 左右 justify-between。
 * 顶栏（TitleBar）、左右侧栏顶部的 icon 按钮统一收在这里。
 */
import {
  Folder,
  FolderInput,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Settings as SettingsIcon,
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
  isDark: boolean
}>()

const emit = defineEmits<{
  find: []
  'toggle-rail': []
  'toggle-ai': []
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
      <a-tooltip title="搜索 (⌘F)">
        <button type="button" class="rail-icon-btn" aria-label="搜索" @click="emit('find')">
          <Search :size="14" />
        </button>
      </a-tooltip>
      <a-tooltip title="打开文件夹">
        <button type="button" class="rail-icon-btn" aria-label="打开文件夹" @click="emit('open-folder')">
          <FolderInput :size="14" />
        </button>
      </a-tooltip>

      <div class="w-px h-4 bg-border-subtle mx-1.5 shrink-0" />

      <a-tooltip :title="aiOpen ? '收起 AI 栏' : '打开 AI 栏'">
        <button
          type="button"
          class="rail-icon-btn"
          :class="{ on: aiOpen }"
          aria-label="打开或收起 AI 栏"
          @click="emit('toggle-ai')"
        >
          <PanelRightClose v-if="aiOpen" :size="14" />
          <PanelRightOpen v-else :size="14" />
        </button>
      </a-tooltip>
      <a-tooltip :title="isDark ? '浅色模式' : '深色模式'">
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
