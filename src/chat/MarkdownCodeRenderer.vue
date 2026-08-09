<script lang="ts">
/**
 * XMarkdown 自定义 `code` 组件：块级代码用 @antdv-next/x 的 CodeHighlighter
 * （Shiki 高亮 + 语言标签 + 复制按钮），mermaid 交给 Mermaid 组件渲染。
 */
import { CodeHighlighter, Mermaid } from '@antdv-next/x'
import { defineComponent, h, inject, type VNode } from 'vue'
import { isDarkKey } from './theme'

function extractText(nodes: VNode[]): string {
  return nodes
    .map((node) => {
      if (typeof node.children === 'string') return node.children
      if (Array.isArray(node.children)) return extractText(node.children as VNode[])
      return ''
    })
    .join('')
}

function readAttr(attrs: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = attrs[name]
    if (typeof value === 'string') return value
  }
  return ''
}

export default defineComponent({
  name: 'MarkdownCodeRenderer',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    const isDark = inject(isDarkKey)

    return () => {
      const code = extractText(slots.default?.() ?? [])
      const className = readAttr(attrs, 'class')
      const classLang = className.match(/(?:^|\s)language-([^\s]+)/)?.[1] ?? ''
      const language =
        readAttr(attrs, 'data-lang', 'dataLang', 'lang') || classLang
      const isBlock = [attrs['data-block'], attrs.dataBlock, attrs.block].some(
        (v) => v === true || v === 'true'
      )

      if (!isBlock && !language) return h('code', code)
      if (language === 'mermaid') return h(Mermaid, { content: code })

      return h(CodeHighlighter, {
        content: code,
        language: language || 'text',
        theme: isDark?.value ? 'dark' : 'light',
        showLineNumbers: true,
        showLanguage: true,
        showCopyButton: true,
      })
    }
  },
})
</script>
