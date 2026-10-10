<script setup lang="ts">
import { MilkdownProvider } from '@milkdown/vue'
import MilkdownCore from './MilkdownCore.vue'

// 外层：仅负责 Provider 与 v-model 透传。
// useEditor 必须在 MilkdownProvider 的子组件中调用，故拆两层。
defineProps<{ modelValue: string }>()
defineEmits<{ 'update:modelValue': [string] }>()
</script>

<template>
  <div>
    <MilkdownProvider>
      <MilkdownCore
        :model-value="modelValue"
        @update:model-value="$emit('update:modelValue', $event)"
      />
    </MilkdownProvider>
  </div>
</template>
