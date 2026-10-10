<script setup lang="ts">
import { ref } from 'vue'
import { Palette, Server, Globe, Type, Wifi, FileText, FolderOpen } from '@lucide/vue'
import { useSettings } from '../composables/useSettings'
import { useTheme } from '../composables/useTheme'
import ProviderSettings from './ProviderSettings.vue'
import type { WebSearchResponse } from '../chat/ipcProvider'

const { settings } = useSettings()
const { themeId, setTheme, themes } = useTheme()

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

/** 左侧分组导航：基础设置 / Agent 能力 */
const activeTab = ref<'basic' | 'theme' | 'startup' | 'providers' | 'search'>('basic')

const NAV_ITEMS = [
  {
    group: '基础设置',
    items: [
      { key: 'theme', label: '主题', icon: Palette },
      { key: 'basic', label: '排版', icon: Type },
      { key: 'startup', label: '启动文档', icon: FileText },
    ],
  },
  {
    group: 'Agent 能力',
    items: [
      { key: 'providers', label: '模型供应商', icon: Server },
      { key: 'search', label: '联网搜索', icon: Globe },
    ],
  },
] as const

function navClass(active: boolean): string {
  return active
    ? '!bg-accent !text-bg hover:!bg-accent hover:!text-bg'
    : 'text-fg-soft hover:bg-bg-soft hover:text-fg'
}

// ===== 联网搜索：Brave Search API 测试 =====
const searchTesting = ref(false)
const searchState = ref<{ ok: boolean; message: string } | null>(null)

async function testSearch(): Promise<void> {
  searchTesting.value = true
  searchState.value = null
  try {
    const res = (await window.muse?.invoke('ai:web-search', {
      query: 'Muse markdown 编辑器',
      apiKey: settings.value.searchApiKey,
      count: 3,
    })) as WebSearchResponse | undefined
    searchState.value = res?.ok
      ? { ok: true, message: `搜索成功，获取 ${res.results?.length ?? 0} 条结果` }
      : { ok: false, message: res?.message ?? '搜索失败' }
  } finally {
    searchTesting.value = false
  }
}

async function pickDefaultDir(): Promise<void> {
  const dir = (await window.muse?.invoke('fs:pickFolder')) as string | null
  if (dir) settings.value.defaultFileDir = dir
}
</script>

<template>
  <a-modal
    :open="open"
    title="设置"
    :width="860"
    :footer="null"
    :destroy-on-hidden="true"
    :styles="{ container: { overflow: 'hidden' }, body: { padding: 0 } }"
    @cancel="emit('close')"
  >
    <div class="flex h-[560px]">
      <!-- 左侧设置导航（无背景 / 无边框，靠右侧卡片的阴影形成视觉分隔） -->
      <aside class="w-44 shrink-0 py-4 overflow-y-auto">
        <template v-for="group in NAV_ITEMS" :key="group.group">
          <div class="px-4 pb-1.5 pt-4 text-[11px] uppercase tracking-wider text-fg-soft first:pt-0">
            {{ group.group }}
          </div>
          <button
            v-for="item in group.items"
            :key="item.key"
            type="button"
            class="flex items-center gap-2.5 mx-2.5 px-3 py-2 rounded-md text-[13px] text-left transition-colors cursor-pointer border-none w-[calc(100%-20px)]"
            :class="navClass(activeTab === item.key)"
            @click="activeTab = item.key"
          >
            <component :is="item.icon" :size="14" />
            {{ item.label }}
          </button>
        </template>
      </aside>

      <!-- 右侧：box-shadow 卡片直接浮在弹窗背景上 -->
      <div class="flex-1 min-w-0 p-5">
        <div class="h-full flex flex-col rounded-xl card-shadow bg-bg overflow-hidden">
          <div class="flex-1 min-h-0 overflow-y-auto">
            <div class="p-6 pb-12">
              <!-- 基础设置：主题 -->
              <div v-if="activeTab === 'theme'">
                <div class="text-lg font-semibold">主题</div>
                <p class="text-xs text-fg-soft mt-1 mb-5">选择整体配色，编辑器代码高亮随之联动，实时生效。</p>
                <div class="grid grid-cols-3 gap-3">
                  <button
                    v-for="t in themes"
                    :key="t.id"
                    type="button"
                    class="text-left rounded-xl border p-2 bg-transparent cursor-pointer transition-colors"
                    :class="t.id === themeId ? 'border-accent bg-bg-hover' : 'border-border hover:border-strong hover:bg-bg-hover'"
                    @click="setTheme(t.id)"
                  >
                    <div class="h-[52px] rounded-lg border border-black/10 overflow-hidden">
                      <div class="h-8 px-2 pt-2" :style="{ background: t.preview.bg }">
                        <div class="h-1.5 w-3/4 rounded-full" :style="{ background: t.preview.fg, opacity: 0.45 }" />
                        <div class="h-1.5 w-1/2 mt-1 rounded-full" :style="{ background: t.preview.fg, opacity: 0.2 }" />
                      </div>
                      <div class="flex h-[20px] items-center gap-1.5 px-2" :style="{ background: t.preview.code }">
                        <span class="h-2 w-2 rounded-full" :style="{ background: t.preview.accent }" />
                        <span class="h-1.5 w-1.5 rounded-full" :style="{ background: t.preview.fg, opacity: 0.35 }" />
                        <span class="h-1.5 w-1.5 rounded-full" :style="{ background: t.preview.fg, opacity: 0.18 }" />
                      </div>
                    </div>
                    <div class="mt-2 flex items-center justify-between px-0.5">
                      <span class="text-[12.5px] font-medium text-fg">{{ t.name }}</span>
                      <span class="text-[10.5px] px-1.5 py-px rounded-full bg-bg-elev text-fg-dim">
                        {{ t.mode === 'dark' ? '深色' : '浅色' }}
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              <!-- 基础设置：排版 -->
              <div v-else-if="activeTab === 'basic'">
                <div class="text-lg font-semibold">排版</div>
                <p class="text-xs text-fg-soft mt-1 mb-6">编辑器字体与行距偏好，实时生效。</p>
                <a-form layout="vertical">
                  <a-form-item>
                    <template #label>
                      <span>字号</span>
                      <span class="ml-2 text-xs text-fg-soft tabular-nums">{{ settings.fontSize }}px</span>
                    </template>
                    <a-slider
                      v-model:value="settings.fontSize"
                      :min="12"
                      :max="22"
                      :step="1"
                      :marks="{ 12: '12', 22: '22' }"
                    />
                  </a-form-item>
                  <a-form-item>
                    <template #label>
                      <span>行高</span>
                      <span class="ml-2 text-xs text-fg-soft tabular-nums">{{ settings.lineHeight }}</span>
                    </template>
                    <a-slider
                      v-model:value="settings.lineHeight"
                      :min="1.4"
                      :max="2.2"
                      :step="0.1"
                      :marks="{ 1.4: '1.4', 2.2: '2.2' }"
                    />
                  </a-form-item>
                </a-form>
              </div>

              <!-- 基础设置：启动文档 -->
              <div v-else-if="activeTab === 'startup'">
                <div class="text-lg font-semibold">启动文档</div>
                <p class="text-xs text-fg-soft mt-1 mb-6">每次启动在固定位置打开同一文件（Typora 式），可在下方自定义目录与文件名。</p>
                <a-form layout="vertical">
                  <a-form-item label="默认目录（留空则为 ~/Documents）">
                    <div class="flex gap-2">
                      <a-input v-model:value="settings.defaultFileDir" placeholder="~/Documents" class="flex-1 min-w-0" allow-clear />
                      <a-button @click="pickDefaultDir"><FolderOpen :size="14" />选择</a-button>
                    </div>
                    <template #extra>启动时在此目录下创建/打开默认文件，不会自动递增。</template>
                  </a-form-item>
                  <a-form-item label="默认文件名">
                    <a-input v-model:value="settings.defaultFileName" placeholder="Untitled.md" allow-clear />
                    <template #extra>始终以此文件名为主，如 Untitled.md；需包含 .md 后缀。</template>
                  </a-form-item>
                </a-form>
                <a-alert type="info" show-icon class="mt-2">
                  <template #message>当前生效路径</template>
                  <template #description>{{ (settings.defaultFileDir || '~/Documents') + '/' + (settings.defaultFileName || 'Untitled.md') }}</template>
                </a-alert>
              </div>

              <!-- Agent 能力：模型供应商 -->
              <ProviderSettings v-else-if="activeTab === 'providers'" />

              <!-- Agent 能力：联网搜索 -->
              <div v-else-if="activeTab === 'search'">
                <div class="text-lg font-semibold">联网搜索</div>
                <p class="text-xs text-fg-soft mt-1 mb-6">
                  对话开启「联网搜索」后，AI 会先检索网络资料再回答。搜索走
                  <a
                    href="https://brave.com/search/api/"
                    target="_blank"
                    rel="noreferrer"
                    class="!text-accent underline underline-offset-2"
                  >
                    Brave Search API
                  </a>
                  ，免费订阅每月 2000 次查询。
                </p>
                <a-form layout="vertical" class="!mb-0">
                  <a-form-item label="Brave Search API Key">
                    <div class="flex gap-2">
                      <a-input-password
                        v-model:value="settings.searchApiKey"
                        placeholder="BSA…"
                        class="flex-1 min-w-0"
                      />
                      <a-button :loading="searchTesting" @click="testSearch">
                        <Wifi :size="14" />测试
                      </a-button>
                    </div>
                    <template #extra>
                      <span v-if="searchState">
                        <a-tag :color="searchState.ok ? 'success' : 'error'" class="!mr-1">
                          {{ searchState.ok ? '搜索成功' : '搜索失败' }}
                        </a-tag>
                        {{ searchState.message }}
                      </span>
                      <span v-else>填写后在 Brave 官网注册获取 Key，可点击「测试」验证。</span>
                    </template>
                  </a-form-item>
                </a-form>
                <a-alert type="info" show-icon class="mt-2">
                  <template #message>密钥仅保存在本地设置中</template>
                  <template #description>
                    联网搜索请求由应用主进程直接发起，密钥不会出现在页面网络请求里。
                  </template>
                </a-alert>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </a-modal>
</template>
