<script setup lang="ts">
import { useSettings } from '../composables/useSettings'

const { settings } = useSettings()

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <a-drawer
    :open="open"
    title="设置"
    placement="right"
    :width="320"
    @close="emit('close')"
  >
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
  </a-drawer>
</template>
