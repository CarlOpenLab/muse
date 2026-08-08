import { computed, type Ref } from 'vue'

export interface Heading {
  level: number
  text: string
  /** 文档内标题的顺序索引（用于点击跳转时匹配 DOM） */
  index: number
}

/**
 * 从 markdown 文本提取标题树（大纲）。
 * 跳过代码围栏内的 `#` 行；不支持 Setext 标题（少见）。
 */
export function useOutline(doc: Ref<string>) {
  return computed<Heading[]>(() => {
    const result: Heading[] = []
    let idx = 0
    let inFence = false
    for (const line of doc.value.split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence
        continue
      }
      if (inFence) continue
      const m = line.match(/^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/)
      if (m) {
        result.push({ level: m[1].length, text: m[2], index: idx++ })
      }
    }
    return result
  })
}
