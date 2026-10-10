import { ref } from 'vue'

/**
 * 链接输入弹窗状态（模块级单例）。
 *
 * 三个入口共用：编辑器内 ⌘K、右键菜单「链接…」、选中气泡工具条。
 * 弹窗本身仍由 App.vue 渲染（LinkModal.vue）——确认后走 dispatchFormat('link', href)。
 */
const linkModalOpen = ref(false)
const linkText = ref('')

/** 打开弹窗；不传初始文字时取当前 DOM 选区（正文选中文字）作为链接文字。 */
export function openLinkModal(text?: string): void {
  linkText.value = (text ?? String(window.getSelection() ?? '')).trim()
  linkModalOpen.value = true
}

export function closeLinkModal(): void {
  linkModalOpen.value = false
}

export function useLinkModal() {
  return { linkModalOpen, linkText, openLinkModal, closeLinkModal }
}
