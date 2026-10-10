<script setup lang="ts">
import BlockMenu from './BlockMenu.vue'

/**
 * 手柄浮层根组件（由 blockChromePlugin 以独立 Vue app 挂到 body）。
 * 根元素 .muse-block-handle 即 BlockProvider 的 content：provider 直接写它的
 * style.left/top 与 data-show，Vue 侧不绑定这两个属性，互不干扰。
 */
const emit = defineEmits<{
  add: []
  openMenu: []
  plusPressed: [v: boolean]
}>()

function onPlusDown(e: PointerEvent): void {
  // 阻止兼容 mousedown：不建 NodeSelection、不打断编辑器光标，也不发起拖拽
  e.preventDefault()
  emit('plusPressed', true)
}
function onPlusUp(): void {
  emit('plusPressed', false)
}
</script>

<template>
  <!-- data-export-hide 必须挂在这个根元素上：BlockProvider#init 会把 content
       （即本元素）从 layer 里 appendChild 到 body 直下，挂在外层 layer 上会失效 -->
  <div class="muse-block-handle" data-show="false" data-export-hide>
    <button
      class="muse-block-handle-btn"
      type="button"
      title="在下方插入块"
      aria-label="在下方插入块"
      @pointerdown="onPlusDown"
      @pointerup="onPlusUp"
      @pointercancel="onPlusUp"
      @click="emit('add')"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M8 3v10M3 8h10"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          fill="none"
        />
      </svg>
    </button>
    <button
      class="muse-block-handle-btn"
      type="button"
      title="拖拽排序 / 点击操作"
      aria-label="拖拽排序，点击打开操作菜单"
      @click="emit('openMenu')"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="6" cy="4" r="1.3" fill="currentColor" />
        <circle cx="10" cy="4" r="1.3" fill="currentColor" />
        <circle cx="6" cy="8" r="1.3" fill="currentColor" />
        <circle cx="10" cy="8" r="1.3" fill="currentColor" />
        <circle cx="6" cy="12" r="1.3" fill="currentColor" />
        <circle cx="10" cy="12" r="1.3" fill="currentColor" />
      </svg>
    </button>
    <BlockMenu />
  </div>
</template>
