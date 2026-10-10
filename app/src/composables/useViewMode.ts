import { ref, watch } from 'vue'

/**
 * 视图模式（Typora「视图」菜单对齐）：源代码模式 / 专注模式 / 打字机模式 / 大纲开关。
 * 模块级单例，持久化到 localStorage。
 */
export interface ViewModeState {
  source: boolean
  focus: boolean
  typewriter: boolean
  outline: boolean
  /** 左侧文件树侧栏（Typora ⌘⇧L） */
  files: boolean
}

const KEY = 'muse:viewmode:v1'

function load(): ViewModeState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<ViewModeState>
      return {
        source: p.source === true,
        focus: p.focus === true,
        typewriter: p.typewriter === true,
        outline: p.outline !== false,
        files: p.files === true,
      }
    }
  } catch {
    /* 损坏数据忽略 */
  }
  return { source: false, focus: false, typewriter: false, outline: true, files: false }
}

const state = ref<ViewModeState>(load())
watch(
  state,
  (s) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s))
    } catch {
      /* 静默 */
    }
  },
  { deep: true }
)

function toggle<K extends keyof ViewModeState>(key: K): void {
  state.value[key] = !state.value[key]
}

export function useViewMode() {
  return { viewMode: state, toggle }
}
