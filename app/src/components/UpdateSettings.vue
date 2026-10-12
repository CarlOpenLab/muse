<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RefreshCw } from '@lucide/vue'

interface Preferences {
  version: string
  enabled: boolean
  automaticChecks: boolean
  automaticDownloads: boolean
  lastCheck: string
}
const prefs = ref<Preferences | null>(null)
const busy = ref(false)
const error = ref('')

async function load(): Promise<void> {
  try {
    prefs.value = await window.muse?.invoke('app:update-preferences') as Preferences ?? null
    if (!prefs.value) error.value = '请在桌面应用中管理更新。'
  } catch (err) {
    error.value = err instanceof Error ? err.message : '读取更新设置失败'
  }
}
async function save(key: 'automaticChecks' | 'automaticDownloads', value: boolean): Promise<void> {
  if (!prefs.value) return
  busy.value = true
  error.value = ''
  try {
    prefs.value = await window.muse?.invoke('app:set-update-preferences', {
      automaticChecks: prefs.value.automaticChecks,
      automaticDownloads: prefs.value.automaticDownloads,
      [key]: value,
    }) as Preferences
  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存更新设置失败'
  } finally {
    busy.value = false
  }
}
async function check(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    await window.muse?.invoke('app:check-for-updates')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '检查更新失败'
  } finally {
    busy.value = false
  }
}
onMounted(load)
</script>

<template>
  <div class="flex flex-col gap-5">
    <div>
      <div class="text-lg font-semibold">应用更新</div>
      <p class="text-xs text-fg-soft mt-1">自动检查 Muse 新版本，查看更新说明并在应用内下载安装。</p>
    </div>
    <template v-if="prefs">
      <div class="rounded-lg border border-border-subtle p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div class="text-sm font-semibold">Muse {{ prefs.version }}</div>
          <div class="text-xs text-fg-soft mt-1">上次检查：{{ prefs.lastCheck ? new Date(prefs.lastCheck).toLocaleString() : '尚未检查' }}</div>
        </div>
        <a-button :loading="busy" @click="check"><RefreshCw :size="14" />检查更新</a-button>
      </div>
      <div class="flex items-center justify-between gap-4">
        <div><div class="text-sm">自动检查更新</div><p class="text-xs text-fg-soft mt-1">每天在后台检查一次，有新版时提醒。</p></div>
        <a-switch aria-label="自动检查更新" :checked="prefs.automaticChecks" :disabled="busy" @change="(value: boolean) => save('automaticChecks', value)" />
      </div>
      <div class="flex items-center justify-between gap-4">
        <div><div class="text-sm">自动下载并安装</div><p class="text-xs text-fg-soft mt-1">发现新版后自动安装，下次启动生效，不中断当前写作。</p></div>
        <a-switch aria-label="自动下载并安装" :checked="prefs.automaticDownloads" :disabled="busy" @change="(value: boolean) => save('automaticDownloads', value)" />
      </div>
      <a-alert v-if="!prefs.enabled" type="info" show-icon message="当前运行位置无法自动安装更新" description="开发模式或只读位置无法自更新。macOS 请先把 Muse 拖入 Applications 后运行；其他平台请放在有写入权限的目录。" />
      <p class="text-xs text-fg-soft">更新来自 CarlOpenLab/muse 的 GitHub Releases，安装前验证发布签名。重启前仍会检查未保存的文档。</p>
    </template>
    <a-alert v-if="error" type="error" show-icon :message="error" />
  </div>
</template>
