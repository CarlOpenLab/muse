import type { ComputedRef, InjectionKey } from 'vue'

/** XMarkdown 明暗主题注入 key（供 MarkdownCodeRenderer 选用 Shiki 主题） */
export const isDarkKey: InjectionKey<ComputedRef<boolean>> = Symbol('muse:chat:isDark')
