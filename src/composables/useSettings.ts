import { ref, watch } from 'vue'

export interface Settings {
  fontSize: number
  lineHeight: number
}

const STORAGE_KEY = 'md-ai:settings'

function load(): Settings {
  const defaults: Settings = { fontSize: 16, lineHeight: 1.7 }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return { ...defaults, ...saved }
  } catch {
    return defaults
  }
}

const settings = ref<Settings>(load())

function apply(): void {
  const s = settings.value
  const root = document.documentElement
  root.style.setProperty('--editor-font-size', `${s.fontSize}px`)
  root.style.setProperty('--editor-line-height', String(s.lineHeight))
}

apply()

watch(settings, (s) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  apply()
}, { deep: true })

export function useSettings() {
  return {
    settings,
    setFontSize: (v: number) => {
      settings.value.fontSize = v
    },
    setLineHeight: (v: number) => {
      settings.value.lineHeight = v
    }
  }
}
