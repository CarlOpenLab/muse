<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Sender } from '@antdv-next/x'
import { Square, Brain, Globe, ChevronDown, Settings2, FileText, SlidersHorizontal, PenLine } from '@lucide/vue'
import type { ProviderConfig } from '../composables/useSettings'

const props = defineProps<{
  modelValue: string
  loading: boolean
  searching?: boolean
  providers: ProviderConfig[]
  activeProvider: string
  activeModel: string
  reasoning: boolean
  reasoningAvailable: boolean
  webSearch: boolean
  webSearchConfigured: boolean
  /** 引用当前文档内容作为上下文 */
  docContext: boolean
  /** AI 可修改文档（agent 工具调用） */
  editingTools: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:activeProvider': [name: string]
  'update:activeModel': [id: string]
  'update:reasoning': [value: boolean]
  'update:webSearch': [value: boolean]
  'update:docContext': [value: boolean]
  'update:editingTools': [value: boolean]
  submit: [value: string]
  cancel: []
  /** 打开设置（管理供应商） */
  manage: []
}>()

// Sender 组件实例 ref：暴露 focus() 供外部聚焦输入框
const senderEl = ref<{ nativeElement: HTMLElement } | null>(null)
function focus(): void {
  senderEl.value?.nativeElement?.querySelector('textarea')?.focus()
}
defineExpose({ focus })

function handleChange(value: string): void {
  emit('update:modelValue', value)
}

function handleSubmit(value: string): void {
  const text = value.trim()
  if (!text) return
  emit('submit', text)
  emit('update:modelValue', '')
}

// ===== 供应商 / 模型选择（自绘弹层：左列供应商，右列模型）=====
const pickerOpen = ref(false)
const pickerOpenUp = ref(true)
const pickerStyle = ref<Record<string, string>>({})
const pickerRootRef = ref<HTMLElement | null>(null)
const pickerPanelRef = ref<HTMLElement | null>(null)

const currentProvider = computed(() =>
  props.providers.find((p) => p.name === props.activeProvider)
)
const currentModels = computed(() => currentProvider.value?.models ?? [])
const activeModelLabel = computed(() => {
  const m = currentModels.value.find((x) => x.id === props.activeModel)
  return m ? m.name || m.id : ''
})
const pickerLabel = computed(() => {
  if (!props.providers.length) return '本地演示'
  return activeModelLabel.value || props.activeProvider
})

function openPicker(): void {
  const rect = pickerRootRef.value?.getBoundingClientRect()
  if (!rect) return
  const panelHeight = 268
  const spaceAbove = rect.top
  const spaceBelow = window.innerHeight - rect.bottom
  const openUp = spaceAbove >= panelHeight || spaceAbove >= spaceBelow
  pickerOpenUp.value = openUp
  pickerStyle.value = {
    right: `${Math.max(8, window.innerWidth - rect.right)}px`,
    ...(openUp
      ? { bottom: `${window.innerHeight - rect.top + 10}px` }
      : { top: `${rect.bottom + 10}px` }),
  }
  pickerOpen.value = true
}
function closePicker(): void {
  pickerOpen.value = false
}
function togglePicker(): void {
  pickerOpen.value ? closePicker() : openPicker()
}

function pickProvider(p: ProviderConfig): void {
  emit('update:activeProvider', p.name)
}

function pickModel(m: ProviderConfig['models'][number]): void {
  if (currentProvider.value) emit('update:activeProvider', currentProvider.value.name)
  emit('update:activeModel', m.id)
  closePicker()
}

// ===== 对话选项（深度思考 / 联网搜索 / 引用文档）：收进一个 icon，popover 开启 =====
// 侧栏布局窄，不横向平铺图标；任一选项开启时工具按钮高亮提示。
const toolsOpen = ref(false)
const toolsStyle = ref<Record<string, string>>({})
const toolsRootRef = ref<HTMLElement | null>(null)
const toolsPanelRef = ref<HTMLElement | null>(null)

/** 任一选项开启 → 工具按钮高亮（用户可感知当前开启项） */
const anyToolOn = computed(
  () => props.reasoning || props.webSearch || props.docContext || props.editingTools
)

function openTools(): void {
  const rect = toolsRootRef.value?.getBoundingClientRect()
  if (!rect) return
  // 输入框在面板底部，弹层向上展开，箭头指向触发按钮
  toolsStyle.value = {
    left: `${Math.max(8, rect.left)}px`,
    bottom: `${window.innerHeight - rect.top + 10}px`,
  }
  closePicker()
  toolsOpen.value = true
}
function closeTools(): void {
  toolsOpen.value = false
}
function toggleTools(): void {
  toolsOpen.value ? closeTools() : openTools()
}

// 点击外部 / Esc 关闭
function onDocMouseDown(e: MouseEvent): void {
  const target = e.target as Node
  if (pickerOpen.value) {
    if (!pickerRootRef.value?.contains(target) && !pickerPanelRef.value?.contains(target)) {
      closePicker()
    }
  }
  if (toolsOpen.value) {
    if (!toolsRootRef.value?.contains(target) && !toolsPanelRef.value?.contains(target)) {
      closeTools()
    }
  }
}
function onDocKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    closePicker()
    closeTools()
  }
}
onMounted(() => {
  document.addEventListener('mousedown', onDocMouseDown)
  document.addEventListener('keydown', onDocKeyDown)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocMouseDown)
  document.removeEventListener('keydown', onDocKeyDown)
})

/** 选中了供应商但尚未配置任何模型时禁止发送 */
const sendDisabled = computed(() => Boolean(props.activeProvider) && props.activeModel === '')
</script>

<template>
  <footer class="chat-footer shrink-0 px-6 pb-5 pt-2">
    <Sender
      ref="senderEl"
      :value="modelValue"
      :loading="loading"
      :disabled="sendDisabled"
      :auto-size="{ minRows: 1, maxRows: 6 }"
      placeholder="问 Muse：总结 / 扩写 / 润色 / 翻译…（Enter 发送，Shift+Enter 换行）"
      :on-change="handleChange"
      :on-submit="handleSubmit"
      :on-cancel="() => emit('cancel')"
    >
      <!-- 空 suffix：屏蔽 Sender 默认渲染在输入区右侧的发送按钮，
           仅保留 footer 中的唯一发送按钮（defaultNode） -->
      <template #suffix></template>

      <!-- footer：对话选项（一个 icon）+ 模型选择器 + 发送按钮，同一行对齐 -->
      <template #footer="{ defaultNode }">
        <div class="chat-footer-row">
          <!-- 最左侧：对话选项（深度思考 / 联网搜索 / 引用文档 收进一个 icon，popover 开启） -->
          <div ref="toolsRootRef" class="chat-tools">
            <a-tooltip :title="anyToolOn ? '对话选项（有开启项）' : '对话选项'">
              <button
                type="button"
                class="chat-toggle"
                :class="{ active: anyToolOn, searching }"
                aria-label="对话选项"
                @click="toggleTools"
              >
                <SlidersHorizontal :size="16" stroke-width="1.8" />
              </button>
            </a-tooltip>

            <Teleport to="body">
              <div
                v-if="toolsOpen"
                ref="toolsPanelRef"
                class="muse-tools-pop"
                :style="toolsStyle"
              >
                <button
                  type="button"
                  class="muse-tools-item"
                  :class="{ active: reasoning, disabled: !reasoningAvailable }"
                  :title="reasoningAvailable ? '' : '当前模型不支持深度思考'"
                  @click="reasoningAvailable && emit('update:reasoning', !reasoning)"
                >
                  <Brain :size="14" />
                  <span class="muse-tools-label">深度思考</span>
                  <span class="muse-tools-state">{{ reasoning ? '开' : '关' }}</span>
                </button>

                <button
                  type="button"
                  class="muse-tools-item"
                  :class="{ active: webSearch, disabled: !webSearchConfigured }"
                  :title="webSearchConfigured ? '' : '需在「设置 → 联网搜索」配置 Brave Search API Key'"
                  @click="webSearchConfigured && emit('update:webSearch', !webSearch)"
                >
                  <Globe :size="14" />
                  <span class="muse-tools-label">联网搜索</span>
                  <span class="muse-tools-state">{{ webSearch ? '开' : '关' }}</span>
                </button>

                <button
                  type="button"
                  class="muse-tools-item"
                  :class="{ active: docContext }"
                  :title="docContext ? '提问时快照当前文档作为上下文' : ''"
                  @click="emit('update:docContext', !docContext)"
                >
                  <FileText :size="14" />
                  <span class="muse-tools-label">引用当前文档</span>
                  <span class="muse-tools-state">{{ docContext ? '开' : '关' }}</span>
                </button>

                <button
                  type="button"
                  class="muse-tools-item"
                  :class="{ active: editingTools }"
                  :title="editingTools ? '模型可用工具直接修改文档（⌘Z 可撤销）' : '模型只能给建议，不直接改文档'"
                  @click="emit('update:editingTools', !editingTools)"
                >
                  <PenLine :size="14" />
                  <span class="muse-tools-label">AI 可修改文档</span>
                  <span class="muse-tools-state">{{ editingTools ? '开' : '关' }}</span>
                </button>
              </div>
            </Teleport>
          </div>

          <div class="flex-1" />

          <!-- 供应商 / 模型选择器（自绘弹层） -->
          <div ref="pickerRootRef" class="chat-model-picker">
            <button
              type="button"
              class="model-picker-trigger"
              :disabled="providers.length === 0"
              :title="providers.length ? '选择供应商与模型' : '去设置中添加供应商'"
              @click="togglePicker"
            >
              <span class="model-picker-dot" />
              <span class="model-picker-text">{{ pickerLabel }}</span>
              <ChevronDown :size="13" class="model-picker-chevron" :class="{ open: pickerOpen }" />
            </button>

            <Teleport to="body">
              <div
                v-if="pickerOpen"
                ref="pickerPanelRef"
                class="muse-picker-wrap"
                :class="pickerOpenUp ? 'muse-picker-open-up' : 'muse-picker-open-down'"
                :style="pickerStyle"
              >
                <div class="muse-picker">
                  <div class="muse-picker-cols">
                    <!-- 左列：供应商 -->
                    <div class="muse-picker-col">
                      <div class="muse-picker-col-title">供应商</div>
                      <div class="muse-picker-list">
                        <button
                          v-for="p in providers"
                          :key="p.name"
                          type="button"
                          class="muse-picker-item"
                          :class="{ active: p.name === activeProvider }"
                          @click="pickProvider(p)"
                        >
                          <span class="muse-picker-item-text">{{ p.name }}</span>
                          <span v-if="p.models.length" class="muse-picker-count">
                            {{ p.models.length }}
                          </span>
                        </button>
                        <div v-if="!providers.length" class="muse-picker-empty">暂无供应商</div>
                      </div>
                    </div>
                    <!-- 右列：模型 -->
                    <div class="muse-picker-col">
                      <div class="muse-picker-col-title">模型</div>
                      <div class="muse-picker-list">
                        <button
                          v-for="m in currentModels"
                          :key="m.id"
                          type="button"
                          class="muse-picker-item"
                          :class="{ active: m.id === activeModel }"
                          @click="pickModel(m)"
                        >
                          <span class="muse-picker-item-text">{{ m.name || m.id }}</span>
                          <span v-if="m.reasoning" class="muse-picker-tag">推理</span>
                        </button>
                        <div v-if="!currentModels.length" class="muse-picker-empty">
                          {{ providers.length ? '该供应商暂无模型' : '先在设置中添加供应商' }}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    class="muse-picker-manage"
                    @click="closePicker(); emit('manage')"
                  >
                    <Settings2 :size="12" />管理供应商
                  </button>
                </div>
              </div>
            </Teleport>
          </div>

          <a-tooltip v-if="loading" title="停止生成">
            <a-button
              type="primary"
              shape="circle"
              class="sender-stop-btn !w-[34px] !h-[34px] !min-w-0 !rounded-[9px] !bg-accent !text-bg"
              aria-label="停止生成"
              @click="emit('cancel')"
            >
              <template #icon><Square :size="13" class="fill-current" /></template>
            </a-button>
          </a-tooltip>
          <component :is="defaultNode" v-else />
        </div>
      </template>
    </Sender>
  </footer>
</template>

<style scoped>
.chat-footer :deep(.antd-sender) {
  width: min(100%, 760px);
  margin: 0 auto;
}
.chat-footer :deep(.antd-sender-main) {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg);
  box-shadow: 0 2px 12px rgba(9, 9, 11, 0.05);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.chat-footer :deep(.antd-sender-main:focus-within) {
  border-color: var(--fg-soft);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--fg-soft) 14%, transparent),
    0 4px 20px rgba(9, 9, 11, 0.07);
}
.chat-footer :deep(.antd-sender-content) {
  padding: 12px 14px 2px;
}
.chat-footer :deep(.antd-sender-footer) {
  padding: 0 12px 10px;
}
.chat-footer :deep(textarea) {
  color: var(--fg);
  caret-color: var(--accent);
  font-size: 13.5px;
  line-height: 1.65;
}
.chat-footer :deep(textarea::placeholder) {
  color: var(--fg-soft);
  opacity: 0.75;
}
.chat-footer :deep(.antd-sender-actions-btn) {
  width: 34px;
  min-width: 34px;
  height: 34px;
  border-radius: 9px;
  background: var(--accent);
  color: var(--bg);
  box-shadow: 0 2px 6px rgba(9, 9, 11, 0.18);
}
.chat-footer :deep(.antd-sender-actions-btn:disabled) {
  opacity: 0.35;
  box-shadow: none;
}
.chat-footer :deep(.antd-sender-actions-btn:hover:not(:disabled)) {
  opacity: 0.9;
}

/* ===== footer 行：图标（左） + 模型选择器 + 发送按钮（右） ===== */
.chat-footer-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
}

/* 深度思考 / 联网搜索 / 引用文档 图标开关：收进一个「对话选项」icon，popover 开启 */
.chat-tools {
  display: flex;
  align-items: center;
}
.chat-toggle {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--fg-soft);
  cursor: pointer;
  transition:
    color 160ms ease,
    background 160ms ease,
    opacity 160ms ease;
}
.chat-toggle:hover {
  background: var(--bg-soft);
  color: var(--fg);
}
.chat-toggle.active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.chat-toggle.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.chat-toggle.disabled:hover {
  background: transparent;
  color: var(--fg-soft);
}
/* 搜索进行中：地球图标旋转 */
.chat-toggle.searching svg {
  animation: chat-globe-spin 1.1s linear infinite;
}
@keyframes chat-globe-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ===== 模型选择器触发按钮 ===== */
.model-picker-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 240px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--bg-soft);
  color: var(--fg);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    opacity 160ms ease;
}
.model-picker-trigger:hover:not(:disabled) {
  border-color: var(--fg-soft);
  background: color-mix(in srgb, var(--bg-soft) 75%, var(--fg-soft) 10%);
}
.model-picker-trigger:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.model-picker-dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--accent);
}
.model-picker-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.model-picker-chevron {
  flex-shrink: 0;
  color: var(--fg-soft);
  transition: transform 160ms ease;
}
.model-picker-chevron.open {
  transform: rotate(180deg);
}

/* 停止按钮：与发送按钮同尺寸同圆角同品牌色，切换时不跳动 */
.sender-stop-btn {
  box-shadow: 0 2px 6px rgba(9, 9, 11, 0.18);
}
.sender-stop-btn:hover {
  opacity: 0.9;
}
</style>

<!-- 弹层内容经 Teleport 到 body，需全局样式（类名加 muse-picker 前缀防冲突） -->
<style>
.muse-picker-wrap {
  position: fixed;
  z-index: 1080;
  width: 332px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  box-shadow:
    0 10px 32px rgba(9, 9, 11, 0.16),
    0 2px 8px rgba(9, 9, 11, 0.08);
}
/* 小箭头：朝触发按钮方向 */
.muse-picker-wrap::before {
  content: '';
  position: absolute;
  width: 10px;
  height: 10px;
  background: var(--bg);
  border-left: 1px solid var(--border);
  border-top: 1px solid var(--border);
}
.muse-picker-open-up::before {
  top: -6px;
  right: 18px;
  transform: rotate(45deg);
}
.muse-picker-open-down::before {
  bottom: -6px;
  right: 18px;
  transform: rotate(225deg);
}

.muse-picker {
  width: 100%;
}
.muse-picker-cols {
  display: flex;
  gap: 10px;
}
.muse-picker-col {
  flex: 1;
  min-width: 0;
}
.muse-picker-col-title {
  padding: 0 6px;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--fg-soft);
  user-select: none;
}
.muse-picker-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 216px;
  overflow-y: auto;
}
.muse-picker-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--fg);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition:
    background 120ms ease,
    color 120ms ease;
}
.muse-picker-item:hover {
  background: var(--bg-soft);
}
.muse-picker-item.active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-weight: 600;
}
.muse-picker-item-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.muse-picker-count {
  font-size: 10.5px;
  color: var(--fg-soft);
  font-variant-numeric: tabular-nums;
}
.muse-picker-tag {
  flex-shrink: 0;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--bg-soft);
  color: var(--fg-soft);
  font-size: 10px;
}
.muse-picker-item.active .muse-picker-tag {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}
.muse-picker-empty {
  padding: 12px 8px;
  font-size: 12px;
  color: var(--fg-soft);
}
.muse-picker-manage {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  margin-top: 8px;
  padding: 7px 8px 1px;
  border: none;
  border-top: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--fg-soft);
  font-size: 11.5px;
  cursor: pointer;
  transition: color 120ms ease;
}
.muse-picker-manage:hover {
  color: var(--accent);
}

/* ===== 对话选项 popover（Teleport 到 body）===== */
.muse-tools-pop {
  position: fixed;
  z-index: 1080;
  width: 228px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg);
  box-shadow:
    0 10px 32px rgba(9, 9, 11, 0.16),
    0 2px 8px rgba(9, 9, 11, 0.08);
}
/* 小箭头：朝触发按钮方向（弹层在触发按钮上方，箭头向下） */
.muse-tools-pop::before {
  content: '';
  position: absolute;
  bottom: -6px;
  left: 20px;
  width: 10px;
  height: 10px;
  background: var(--bg);
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  transform: rotate(45deg);
}
.muse-tools-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 9px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--fg);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition:
    background 120ms ease,
    color 120ms ease;
}
.muse-tools-item:hover:not(.disabled) {
  background: var(--bg-soft);
}
.muse-tools-item.active {
  color: var(--accent);
}
.muse-tools-item.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.muse-tools-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.muse-tools-state {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--fg-soft);
  font-variant-numeric: tabular-nums;
}
.muse-tools-item.active .muse-tools-state {
  color: var(--accent);
  font-weight: 600;
}
</style>
