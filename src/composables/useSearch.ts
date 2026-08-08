import { ref } from 'vue'

export type SearchAction = 'search' | 'next' | 'prev' | 'replace' | 'replaceAll'

export interface SearchMatch {
  from: number
  to: number
}

// 单例搜索状态：MilkdownCore（执行搜索/替换）与 SearchBar（UI）共享
const query = ref('')
const replaceText = ref('')
const isOpen = ref(false)
const matches = ref<SearchMatch[]>([])
const current = ref(0)
/** 待执行动作：SearchBar 置入，MilkdownCore watch 执行后清空 */
const pendingAction = ref<SearchAction | null>(null)

export function useSearch() {
  return {
    query,
    replaceText,
    isOpen,
    matches,
    current,
    pendingAction,
    open() {
      isOpen.value = true
    },
    close() {
      isOpen.value = false
      query.value = ''
      replaceText.value = ''
      matches.value = []
      current.value = 0
    },
    request(action: SearchAction) {
      pendingAction.value = action
    }
  }
}
