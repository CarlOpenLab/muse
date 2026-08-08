import { createHighlighterCore, type HighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import type { ThemedToken } from 'shiki'

/**
 * Shiki 高亮器单例（精细打包版）。
 *
 * 用 `shiki/core` + 显式动态 import 指定语言/主题，Vite 只会为这些生成
 * 独立的 lazy chunk（而非 bundle-full 的全部 100+ 语言）。
 * 引擎用纯 JS 的 `createJavaScriptRegexEngine`，无需加载 wasm，最适合 Electron。
 *
 * - `createHighlighterCore` 异步拉取语法/主题数据；
 * - 同时加载 `github-light` 与 `github-dark` 两个主题，切换时仅改 active 标记，
 *   无需重新加载，配 `shikiCodeBlock.refreshShikiHighlight()` 即时重着色；
 * - 完成后 `codeToTokens` 是同步的，可直接在 ProseMirror decoration 回调里用。
 */

export type ShikiThemeName = 'github-light' | 'github-dark'

/** 已加载的 Shiki 主题（亮/暗各一）。 */
export const SHIKI_THEMES: ShikiThemeName[] = ['github-light', 'github-dark']

let activeTheme: ShikiThemeName = 'github-light'

/** 当前生效的 Shiki 主题。 */
export function getActiveShikiTheme(): ShikiThemeName {
  return activeTheme
}

/** 切换 Shiki 主题；调用方需再触发一次 decoration 重建（refreshShikiHighlight）。 */
export function setActiveShikiTheme(t: ShikiThemeName): void {
  activeTheme = t
}

/** 常见别名归一化到 Shiki 语言 id。 */
const ALIAS: Record<string, string> = {
  js: 'javascript', ts: 'typescript', py: 'python',
  sh: 'bash', shell: 'bash', zsh: 'bash', shellscript: 'bash',
  rb: 'ruby', 'c++': 'cpp', 'c#': 'csharp', cs: 'csharp',
  golang: 'go', rs: 'rust', yml: 'yaml', md: 'markdown',
  kt: 'kotlin', json5: 'json', config: 'ini',
}

let hlPromise: Promise<HighlighterCore> | null = null

/** 获取（惰性创建）全局 Shiki 高亮器；首次调用会按需加载语言 chunk。 */
export function getHighlighter(): Promise<HighlighterCore> {
  if (!hlPromise) {
    hlPromise = createHighlighterCore({
      langs: [
        import('shiki/langs/javascript.mjs'),
        import('shiki/langs/typescript.mjs'),
        import('shiki/langs/jsx.mjs'),
        import('shiki/langs/tsx.mjs'),
        import('shiki/langs/python.mjs'),
        import('shiki/langs/bash.mjs'),
        import('shiki/langs/json.mjs'),
        import('shiki/langs/html.mjs'),
        import('shiki/langs/css.mjs'),
        import('shiki/langs/vue.mjs'),
        import('shiki/langs/markdown.mjs'),
        import('shiki/langs/yaml.mjs'),
        import('shiki/langs/xml.mjs'),
        import('shiki/langs/sql.mjs'),
        import('shiki/langs/go.mjs'),
        import('shiki/langs/rust.mjs'),
        import('shiki/langs/java.mjs'),
        import('shiki/langs/c.mjs'),
        import('shiki/langs/cpp.mjs'),
        import('shiki/langs/csharp.mjs'),
        import('shiki/langs/php.mjs'),
        import('shiki/langs/ruby.mjs'),
        import('shiki/langs/swift.mjs'),
        import('shiki/langs/kotlin.mjs'),
        import('shiki/langs/diff.mjs'),
        import('shiki/langs/toml.mjs'),
      ],
      themes: [
        import('shiki/themes/github-light.mjs'),
        import('shiki/themes/github-dark.mjs'),
      ],
      engine: createJavaScriptRegexEngine(),
    })
  }
  return hlPromise
}

/** 把用户输入的 language 标识归一化。 */
export function normalizeLang(lang: string): string {
  return ALIAS[(lang || '').trim().toLowerCase()] ?? (lang || '').trim().toLowerCase()
}

/**
 * 把代码切成带颜色的 token 二维数组（行 -> token）。
 * 语言未加载时返回 `null`，表示不高亮（纯文本渲染）。
 */
export function tokenize(
  hl: HighlighterCore,
  code: string,
  lang: string,
): ThemedToken[][] | null {
  const n = normalizeLang(lang)
  if (!n) return null
  if (!hl.getLoadedLanguages().includes(n)) return null
  try {
    const { tokens } = hl.codeToTokens(code, { lang: n, theme: getActiveShikiTheme() })
    return tokens
  } catch {
    return null
  }
}
