import { ref } from 'vue'

export type SearchAction = 'search' | 'next' | 'prev' | 'goto' | 'replace' | 'replaceAll'

export interface SearchMatch {
  from: number
  to: number
  /** 结果列表用的上下文片段（命中词所在段落的一小段） */
  text: string
  /** 命中词在 text 中的起始下标 */
  hit: number
}

// 单例搜索状态：MilkdownCore（执行搜索/替换）与 SearchBar（UI）共享
const query = ref('')
const replaceText = ref('')
const isOpen = ref(false)
const matches = ref<SearchMatch[]>([])
const current = ref(0)
/** 待执行动作：SearchBar 置入，MilkdownCore watch 执行后清空 */
const pendingAction = ref<SearchAction | null>(null)
/** 每次 open() 自增：已打开时再按 ⌘F 也能把焦点抢回输入框 */
const focusToken = ref(0)

export function useSearch() {
  return {
    query,
    replaceText,
    isOpen,
    matches,
    current,
    pendingAction,
    focusToken,
    open() {
      isOpen.value = true
      focusToken.value += 1
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
