import { computed, ref, watch } from 'vue'
import { setActiveShikiTheme, type ShikiThemeName } from '../editor/shiki/highlighter'
import { refreshShikiHighlight } from '../editor/shiki/shikiCodeBlock'

/**
 * 多主题管理（单例，Typora 式）。
 *
 * - 每套主题 = 一组语义 CSS 变量色板（base.css 的 `:root[data-theme='xx']`）+ 配套 Shiki 高亮主题；
 * - 在 <html> 上同时维护 `data-theme`（色板选择）与 `.dark` 类（明暗模式）：
 *   `.dark` 供 antdv / XMarkdown / `:root.dark` 覆盖规则判断明暗，`data-theme` 选择具体色板；
 * - 偏好来源优先级：localStorage > 系统偏好 > 默认浅色；
 * - 切换主题即时同步 Shiki 主题并重建代码块着色；
 * - index.html 有一段内联脚本在 Vue 挂载前设置 `data-theme` 与 `.dark`，避免首屏闪烁
 *   （脚本里的 id → 明暗 映射需与下方 THEMES 保持一致）。
 *
 * 模块级状态 + 单次 watch：多个组件调用 useTheme() 共享同一份状态，不会重复监听。
 */

export interface MuseTheme {
  id: string
  name: string
  mode: 'light' | 'dark'
  /** 配套的 Shiki 代码高亮主题 */
  shiki: ShikiThemeName
  /** 设置面板选择器里的迷你预览色（底色 / 前景 / 强调 / 代码块底） */
  preview: { bg: string; fg: string; accent: string; code: string }
}

/** 主题注册表：与 base.css 的 `:root[data-theme='…']` 色板一一对应。 */
export const THEMES: MuseTheme[] = [
  {
    id: 'light',
    name: '默认浅色',
    mode: 'light',
    shiki: 'github-light',
    preview: { bg: '#ffffff', fg: '#1f1f21', accent: '#1f1f21', code: '#f6f6f7' },
  },
  {
    id: 'dark',
    name: '默认深色',
    mode: 'dark',
    shiki: 'github-dark',
    preview: { bg: '#1a1a1a', fg: '#e2e2e2', accent: '#e2e2e2', code: '#151515' },
  },
  {
    id: 'nord',
    name: 'Nord',
    mode: 'dark',
    shiki: 'nord',
    preview: { bg: '#2e3440', fg: '#d8dee9', accent: '#88c0d0', code: '#262b36' },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    mode: 'dark',
    shiki: 'dracula',
    preview: { bg: '#282a36', fg: '#f8f8f2', accent: '#bd93f9', code: '#21222c' },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    mode: 'dark',
    shiki: 'catppuccin-mocha',
    preview: { bg: '#1e1e2e', fg: '#cdd6f4', accent: '#89b4fa', code: '#181825' },
  },
  {
    id: 'everforest',
    name: 'Everforest',
    mode: 'light',
    shiki: 'everforest-light',
    preview: { bg: '#fdf6e3', fg: '#5c6a72', accent: '#3a94c5', code: '#f2ebd6' },
  },
  {
    id: 'sepia',
    name: '羊皮纸',
    mode: 'light',
    shiki: 'github-light',
    preview: { bg: '#f4ecd8', fg: '#433422', accent: '#9c6b30', code: '#eae0ca' },
  },
]

export const THEME_MAP: Record<string, MuseTheme> = Object.fromEntries(
  THEMES.map((t) => [t.id, t]),
)

const STORAGE_KEY = 'muse:theme'

function systemDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

function initialThemeId(): string {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved && THEME_MAP[saved]) return saved
  return systemDark() ? 'dark' : 'light'
}

const themeId = ref<string>(initialThemeId())

/** 当前主题的明暗模式（派生）：antdv / XMarkdown / StatusBar 等仍按明暗两态工作。 */
const isDark = computed(() => currentTheme.value.mode === 'dark')

const currentTheme = computed<MuseTheme>(() => THEME_MAP[themeId.value] ?? THEMES[0])

function apply(theme: MuseTheme): void {
  const root = document.documentElement
  root.dataset.theme = theme.id
  root.classList.toggle('dark', theme.mode === 'dark')
  root.style.colorScheme = theme.mode
  setActiveShikiTheme(theme.shiki)
  // Shiki 可能尚未加载（activeView 为空时为空操作）；已加载则立即用新主题重着色
  refreshShikiHighlight()
}

// 模块加载即同步一次，与 index.html 的防闪烁内联脚本保持一致
apply(currentTheme.value)

watch(themeId, (id) => {
  localStorage.setItem(STORAGE_KEY, id)
  apply(THEME_MAP[id] ?? THEMES[0])
})

export function useTheme() {
  return {
    themeId,
    isDark,
    themes: THEMES,
    currentTheme,
    /** 快捷切换：在默认浅色 / 默认深色之间翻转（StatusBar 按钮） */
    toggle: () => {
      themeId.value = isDark.value ? 'light' : 'dark'
    },
    setTheme: (id: string) => {
      if (THEME_MAP[id]) themeId.value = id
    },
  }
}
