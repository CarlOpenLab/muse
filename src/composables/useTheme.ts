import { ref, watch } from 'vue'
import { setActiveShikiTheme } from '../editor/shiki/highlighter'
import { refreshShikiHighlight } from '../editor/shiki/shikiCodeBlock'

/**
 * 明暗主题管理（单例）。
 *
 * - 偏好来源优先级：localStorage > 系统偏好 > 亮色；
 * - 在 <html> 上切换 `.dark` 类驱动所有 CSS 变量；
 * - 同步切换 Shiki 代码高亮主题并即时重建着色；
 * - index.html 有一段内联脚本在 Vue 挂载前设置 `.dark`，避免首屏闪烁。
 *
 * 模块级状态 + 单次 watch：多个组件调用 useTheme() 共享同一份状态，不会重复监听。
 */

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'muse:theme'

function systemDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

function initialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return systemDark() ? 'dark' : 'light'
}

const isDark = ref(initialTheme() === 'dark')

function apply(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  setActiveShikiTheme(dark ? 'github-dark' : 'github-light')
  // Shiki 可能尚未加载（activeView 为空时为空操作）；已加载则立即用新主题重着色
  refreshShikiHighlight()
}

// 模块加载即同步一次，与 index.html 的防闪烁内联脚本保持一致
apply(isDark.value)

watch(isDark, (dark) => {
  localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
  apply(dark)
})

export function useTheme() {
  return {
    isDark,
    toggle: () => {
      isDark.value = !isDark.value
    },
    setTheme: (t: Theme) => {
      isDark.value = t === 'dark'
    },
  }
}
