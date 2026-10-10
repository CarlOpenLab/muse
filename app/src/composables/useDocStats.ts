import { computed, type Ref } from 'vue'

export interface DocStats {
  /** 字数：CJK 字符 + 英文单词 */
  words: number
  /** 字符数（含空白） */
  chars: number
  /** CJK 字符数 */
  cjk: number
  /** 行数 */
  lines: number
}

/**
 * 文档统计（字数 / 字符 / 行数）。
 * 字数 = CJK 汉字数 + 英文单词数（与 Word/Typora 口径接近）。
 */
export function useDocStats(doc: Ref<string>) {
  return computed<DocStats>(() => {
    const text = doc.value
    const chars = text.length
    const cjkMatches = text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g)
    const cjk = cjkMatches ? cjkMatches.length : 0
    const enMatches = text
      .replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ')
      .match(/[A-Za-z0-9]+/g)
    const en = enMatches ? enMatches.length : 0
    return {
      words: cjk + en,
      chars,
      cjk,
      lines: text ? text.split('\n').length : 0
    }
  })
}
