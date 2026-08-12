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
 * - 一次性加载全部 6 套配套主题（与 useTheme 的 THEMES 注册表对应），切换时仅改
 *   active 标记，无需重新加载，配 `shikiCodeBlock.refreshShikiHighlight()` 即时重着色；
 * - 完成后 `codeToTokens` 是同步的，可直接在 ProseMirror decoration 回调里用。
 */

export type ShikiThemeName =
  | 'github-light'
  | 'github-dark'
  | 'nord'
  | 'dracula'
  | 'catppuccin-mocha'
  | 'everforest-light'

/** 已加载的 Shiki 主题（多主题注册表全部色板各一）。 */
export const SHIKI_THEMES: ShikiThemeName[] = [
  'github-light',
  'github-dark',
  'nord',
  'dracula',
  'catppuccin-mocha',
  'everforest-light',
]

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
        import('shiki/themes/nord.mjs'),
        import('shiki/themes/dracula.mjs'),
        import('shiki/themes/catppuccin-mocha.mjs'),
        import('shiki/themes/everforest-light.mjs'),
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
 * 代码块语言下拉的可选项。
 *
 * 与上面 `langs` 列表保持同步：value 用归一化后的 Shiki 语言 id（即
 * `normalizeLang` 映射的目标），label 用人类可读名称。`codeBlockView` 的
 * 语言 `<select>` 直接消费这张表，保证「下拉里能选的」≈「能高亮的」。
 */
export const LANGUAGE_OPTIONS: { label: string; value: string }[] = [
  { label: '纯文本', value: '' },
  { label: 'JavaScript', value: 'javascript' },
  { label: 'TypeScript', value: 'typescript' },
  { label: 'JSX', value: 'jsx' },
  { label: 'TSX', value: 'tsx' },
  { label: 'Python', value: 'python' },
  { label: 'Bash / Shell', value: 'bash' },
  { label: 'JSON', value: 'json' },
  { label: 'HTML', value: 'html' },
  { label: 'CSS', value: 'css' },
  { label: 'Vue', value: 'vue' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'YAML', value: 'yaml' },
  { label: 'XML', value: 'xml' },
  { label: 'SQL', value: 'sql' },
  { label: 'Go', value: 'go' },
  { label: 'Rust', value: 'rust' },
  { label: 'Java', value: 'java' },
  { label: 'C', value: 'c' },
  { label: 'C++', value: 'cpp' },
  { label: 'C#', value: 'csharp' },
  { label: 'PHP', value: 'php' },
  { label: 'Ruby', value: 'ruby' },
  { label: 'Swift', value: 'swift' },
  { label: 'Kotlin', value: 'kotlin' },
  { label: 'Diff', value: 'diff' },
  { label: 'TOML', value: 'toml' },
]

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
