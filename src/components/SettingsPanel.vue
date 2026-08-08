<script setup lang="ts">
import { X } from '@lucide/vue'
import { useSettings } from '../composables/useSettings'

const { settings } = useSettings()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div
    class="fixed inset-0 z-30 bg-black/25 flex justify-end"
    @click.self="emit('close')"
  >
    <div
      class="panel-glass w-80 h-full rounded-l-2xl border-l border-border-subtle shadow-2xl p-5 flex flex-col gap-5"
    >
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold">设置</h2>
        <button
          class="w-7 h-7 flex items-center justify-center rounded text-fg-soft hover:bg-bg-soft hover:text-fg transition-colors"
          @click="emit('close')"
        >
          <X :size="16" />
        </button>
      </div>

      <label class="flex flex-col gap-2 text-xs text-fg-soft">
        <span class="flex items-center justify-between">
          <span>字号</span>
          <b class="text-fg tabular-nums">{{ settings.fontSize }}px</b>
        </span>
        <input
          v-model.number="settings.fontSize"
          type="range"
          min="12"
          max="22"
          step="1"
          class="accent-(--accent)"
        />
      </label>

      <label class="flex flex-col gap-2 text-xs text-fg-soft">
        <span class="flex items-center justify-between">
          <span>行高</span>
          <b class="text-fg tabular-nums">{{ settings.lineHeight }}</b>
        </span>
        <input
          v-model.number="settings.lineHeight"
          type="range"
          min="1.4"
          max="2.2"
          step="0.1"
          class="accent-(--accent)"
        />
      </label>
    </div>
  </div>
</template>
