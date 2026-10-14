import { ref, watch } from 'vue'

/**
 * 左侧栏当前页签（文件树 / 大纲）。
 * 与 viewMode.files（侧栏是否展开）分开：折叠再展开后应该停在原来的页签上。
 * 模块级单例，持久化到 localStorage。
 */
export type LeftTab = 'files' | 'outline'

const KEY = 'muse:leftpanel:v1'

function load(): LeftTab {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as { tab?: unknown }
      return p.tab === 'outline' ? 'outline' : 'files'
    }
  } catch {
    /* 忽略损坏的持久化数据 */
  }
  return 'files'
}

const tab = ref<LeftTab>(load())
watch(tab, (t) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ tab: t }))
  } catch {
    /* 存储满等场景静默失败 */
  }
})

function setTab(next: LeftTab): void {
  tab.value = next
}

export function useLeftPanel() {
  return { leftTab: tab, setTab }
}