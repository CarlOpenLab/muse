<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Plus, Trash2, Server, Wifi } from '@lucide/vue'
import message from 'antdv-next/dist/message/index'
import { useSettings, type ProviderConfig, type ProviderModel } from '../composables/useSettings'
import { PROVIDER_PRESETS, type ProviderPreset } from '../composables/providerPresets'

const { settings, addProvider, removeProvider } = useSettings()

// ===== 供应商列表 / 选中（按名称） =====
const selectedName = ref('')
const providerNames = computed(() => settings.value.providers.map((p) => p.name))
const provider = computed(() => settings.value.providers.find((p) => p.name === selectedName.value))

watch(
  providerNames,
  (names) => {
    if (!names.includes(selectedName.value)) selectedName.value = names[0] ?? ''
  },
  { immediate: true }
)

// ===== 添加向导：预设选择 → 填 Key → 测试联通 =====
const addOpen = ref(false)
const addMode = ref<'preset' | 'manual'>('preset')
const step = ref<'select' | 'config'>('select')
const draftPresetId = ref('')
const draftName = ref('')
const draftBaseUrl = ref('')
const draftApiKey = ref('')
const testing = ref(false)
const testResult = ref<{ ok: boolean; status?: number; message: string } | null>(null)

watch(addOpen, (open) => {
  if (!open) return
  addMode.value = PROVIDER_PRESETS.length ? 'preset' : 'manual'
  step.value = 'select'
  draftPresetId.value = ''
  draftName.value = ''
  draftBaseUrl.value = ''
  draftApiKey.value = ''
  testResult.value = null
})

watch(addMode, () => {
  step.value = addMode.value === 'preset' ? 'select' : 'config'
  testResult.value = null
})

/** 联通测试统一走主进程 IPC（Node fetch，无 CORS） */
async function runTest(baseUrl: string, apiKey: string): Promise<void> {
  testing.value = true
  testResult.value = null
  try {
    const res = (await window.muse?.invoke('ai:test-connection', { baseUrl, apiKey })) as
      | { ok: boolean; status?: number; message: string }
      | undefined
    testResult.value = res ?? { ok: false, message: 'IPC 不可用' }
  } finally {
    testing.value = false
  }
}

function goConfig(): void {
  const preset = PROVIDER_PRESETS.find((p) => p.id === draftPresetId.value)
  if (!preset) return
  draftName.value = preset.label
  draftBaseUrl.value = preset.provider.baseUrl ?? ''
  draftApiKey.value = ''
  testResult.value = null
  step.value = 'config'
}

const canAdd = computed(() => Boolean(draftName.value.trim()) && testResult.value?.ok === true)

function confirmAdd(): void {
  const name = draftName.value.trim()
  const fromPreset = addMode.value === 'preset' && PROVIDER_PRESETS.some((p) => p.id === draftPresetId.value)
  const created = addProvider({
    name,
    baseUrl: draftBaseUrl.value.trim() || undefined,
    apiKey: draftApiKey.value.trim() || undefined,
    models: fromPreset
      ? clone(PROVIDER_PRESETS.find((p) => p.id === draftPresetId.value)?.models ?? [])
      : [],
  })
  if (!created) {
    message.error('名称不能为空或已存在，请更换名称')
    return
  }
  selectedName.value = name
  message.success(fromPreset ? `已添加 ${name}（含预设模型，可在详情中调整）` : `已添加 ${name}`)
  addOpen.value = false
}

// ===== 详情卡：删除 / 模型管理 / 复测 =====
function onRemoveProvider(): void {
  const name = selectedName.value
  removeProvider(name)
  message.success(`已删除 ${name}`)
}

function addModel(): void {
  provider.value?.models.push({ id: '' })
}

function removeModel(model: ProviderModel): void {
  const list = provider.value?.models
  if (!list) return
  const index = list.indexOf(model)
  if (index >= 0) list.splice(index, 1)
}

const cardTesting = ref(false)
const cardTest = ref<{ ok: boolean; status?: number; message: string } | null>(null)
watch(selectedName, () => {
  cardTest.value = null
})

async function testProvider(): Promise<void> {
  const p = provider.value
  if (!p) return
  cardTesting.value = true
  cardTest.value = null
  try {
    const res = (await window.muse?.invoke('ai:test-connection', {
      baseUrl: p.baseUrl,
      apiKey: p.apiKey,
    })) as { ok: boolean; status?: number; message: string } | undefined
    cardTest.value = res ?? { ok: false, message: 'IPC 不可用' }
  } finally {
    cardTesting.value = false
  }
}

/** Presets 是响应式 proxy，structuredClone 会拒绝；都是纯 JSON，往返一次即脱钩 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <div class="text-lg font-semibold">模型供应商</div>
      <p class="text-xs text-fg-soft mt-1">
        配置 AI 对话可用的模型服务。添加时可测试联通性，确保配置可用。
      </p>
    </div>

    <!-- Provider 切换 + 添加 -->
    <div class="flex items-center gap-2 flex-wrap">
      <a-segmented
        v-if="providerNames.length"
        :value="selectedName"
        :options="providerNames"
        @change="(value: unknown) => (selectedName = value as string)"
      />
      <a-button type="dashed" @click="addOpen = true"><Plus :size="15" />添加 Provider</a-button>
    </div>

    <!-- Provider 详情 -->
    <template v-if="provider">
      <div class="rounded-lg border border-border-subtle">
        <div class="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
          <div class="flex items-center gap-2">
            <Server :size="14" class="text-fg-soft" />
            <span class="text-sm font-semibold">{{ provider.name }}</span>
          </div>
          <a-popconfirm
            title="确定删除这个 Provider？"
            ok-text="删除"
            cancel-text="取消"
            @confirm="onRemoveProvider"
          >
            <a-button type="text" danger size="small"><Trash2 :size="14" />删除</a-button>
          </a-popconfirm>
        </div>

        <div class="p-4">
          <a-form layout="vertical" class="!mb-0">
            <a-row :gutter="16">
              <a-col :span="24">
                <a-form-item label="Base URL">
                  <a-input v-model:value="provider.baseUrl" placeholder="https://api.example.com/v1" />
                </a-form-item>
              </a-col>
              <a-col :span="24">
                <a-form-item label="API Key">
                  <div class="flex gap-2">
                    <a-input-password
                      v-model:value="provider.apiKey"
                      placeholder="sk-…"
                      class="flex-1 min-w-0"
                    />
                    <a-button :loading="cardTesting" @click="testProvider" class="shrink-0">
                      <Wifi :size="14" />测试联通
                    </a-button>
                  </div>
                  <template #extra>
                    <span v-if="cardTest">
                      <a-tag :color="cardTest.ok ? 'success' : 'error'" class="!mr-1">
                        {{ cardTest.ok ? '联通成功' : '联通失败' }}
                      </a-tag>
                      {{ cardTest.message }}
                    </span>
                    <span v-else>填写后点击「测试联通」，验证 Base URL 与密钥。</span>
                  </template>
                </a-form-item>
              </a-col>
            </a-row>
          </a-form>

          <!-- 模型列表 -->
          <div class="mt-1">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs text-fg-soft">模型（{{ provider.models.length }}）</span>
              <a-button type="text" size="small" class="!text-accent" @click="addModel">
                <Plus :size="14" />添加模型
              </a-button>
            </div>
            <div v-if="provider.models.length" class="flex flex-col gap-1.5">
              <div
                v-for="(model, index) in provider.models"
                :key="model.id + index"
                class="flex items-center gap-2 px-3 py-2 rounded-md border border-border-subtle"
              >
                <a-input v-model:value="model.id" placeholder="model-id" class="flex-1 min-w-0" />
                <a-input
                  v-model:value="model.name"
                  placeholder="显示名称（可选）"
                  class="w-36 shrink-0"
                />
                <a-checkbox v-model:checked="model.reasoning" class="shrink-0">推理</a-checkbox>
                <a-tooltip title="删除模型">
                  <a-button type="text" danger size="small" class="shrink-0" @click="removeModel(model)">
                    <Trash2 :size="14" />
                  </a-button>
                </a-tooltip>
              </div>
            </div>
            <div v-else class="text-xs text-fg-soft py-2">
              尚未添加模型。手动创建可在此添加支持的模型；从预设导入的模型也可继续增删。
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 空状态 -->
    <div
      v-else
      class="rounded-lg border border-dashed border-border-subtle py-12 flex flex-col items-center gap-3"
    >
      <Server :size="28" class="text-fg-soft" />
      <p class="text-sm text-fg-soft">还没有模型供应商</p>
      <a-button type="primary" @click="addOpen = true"><Plus :size="16" />添加 Provider</a-button>
    </div>

    <!-- 添加 Provider 向导 -->
    <a-modal
      v-model:open="addOpen"
      :title="addMode === 'preset' && step === 'select' ? '选择预设' : '添加 Provider'"
      :width="540"
      :footer="null"
      :destroy-on-hidden="true"
    >
      <a-segmented
        v-if="PROVIDER_PRESETS.length"
        :value="addMode"
        :options="[
          { label: '从预设导入', value: 'preset' },
          { label: '手动创建', value: 'manual' },
        ]"
        class="mb-4"
        @change="(value: unknown) => (addMode = value as 'preset' | 'manual')"
      />

      <!-- 第一步：选预设 -->
      <template v-if="addMode === 'preset' && step === 'select'">
        <a-radio-group v-model:value="draftPresetId" class="preset-list">
          <a-radio
            v-for="preset in PROVIDER_PRESETS"
            :key="preset.id"
            :value="preset.id"
            class="preset-item"
          >
            <div class="preset-item-body">
              <div class="preset-item-head">
                <span class="text-sm font-semibold">{{ preset.label }}</span>
                <a-tag v-if="preset.models.length">{{ preset.models.length }} 个模型</a-tag>
                <a-tag v-else color="default">仅连接信息</a-tag>
              </div>
              <span class="text-xs text-fg-soft">{{ preset.description }}</span>
              <span class="text-[11px] text-fg-soft font-mono">
                {{ preset.provider.baseUrl ?? '无需 Base URL' }}
              </span>
            </div>
          </a-radio>
        </a-radio-group>
        <div class="flex justify-end gap-2 mt-4">
          <a-button @click="addOpen = false">取消</a-button>
          <a-button type="primary" :disabled="!draftPresetId" @click="goConfig">下一步</a-button>
        </div>
      </template>

      <!-- 第二步：名称 / Base URL / API Key + 测试联通 -->
      <template v-else>
        <a-form layout="vertical" class="!mb-0">
          <a-form-item label="名称">
            <a-input v-model:value="draftName" placeholder="例如 DeepSeek / OpenCode Go" />
          </a-form-item>
          <a-form-item label="Base URL">
            <a-input v-model:value="draftBaseUrl" placeholder="https://api.example.com/v1" />
          </a-form-item>
          <a-form-item label="API Key" :extra="testResult ? undefined : '填写后点击「测试联通」验证配置。'">
            <div class="flex gap-2">
              <a-input-password v-model:value="draftApiKey" placeholder="sk-…" class="flex-1 min-w-0" />
              <a-button :loading="testing" @click="runTest(draftBaseUrl, draftApiKey)" class="shrink-0">
                <Wifi :size="14" />测试联通
              </a-button>
            </div>
          </a-form-item>
        </a-form>

        <div v-if="testResult" class="flex items-center gap-2 mb-4 px-3 py-2 rounded-md border border-border-subtle">
          <a-tag :color="testResult.ok ? 'success' : 'error'" class="!mr-0 shrink-0">
            {{ testResult.ok ? '联通成功' : '联通失败' }}
          </a-tag>
          <a-typography-text :type="testResult.ok ? 'success' : 'danger'" class="text-xs">
            {{ testResult.message }}
          </a-typography-text>
        </div>

        <a-alert type="info" show-icon>
          <template #message>
            {{ addMode === 'preset' ? '预设只是起点' : '手动创建' }}
          </template>
          <template #description>
            {{
              addMode === 'preset'
                ? '模型清单已从预设导入，可在添加后的详情里继续增删；模型 ID 会随厂商调整，请对照官方文档核对。'
                : '创建后可在详情里手动添加支持的模型。'
            }}
          </template>
        </a-alert>

        <div class="flex justify-end gap-2 mt-4">
          <a-button v-if="addMode === 'preset'" @click="step = 'select'">上一步</a-button>
          <a-button type="primary" :disabled="!canAdd" @click="confirmAdd">
            <template v-if="!canAdd && testResult && !testResult.ok">修复后重新测试</template>
            <template v-else-if="!canAdd">先通过联通测试</template>
            <template v-else>添加</template>
          </a-button>
        </div>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
/* 预设列表（对齐 pim 的 preset-list 交互） */
.preset-list {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}
.preset-item {
  display: flex;
  align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}
.preset-item :deep(.ant-radio) {
  margin-top: 3px;
}
.preset-item-body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  margin-left: 2px;
}
.preset-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
