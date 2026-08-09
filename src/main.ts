import { createApp } from 'vue'
import 'antdv-next/dist/reset.css'
import '@antdv-next/x-markdown/themes/index.css'
import '@antdv-next/x-markdown/themes/light.css'
import '@antdv-next/x-markdown/themes/dark.css'
import App from './App.vue'
import 'virtual:uno.css'
import './styles/base.css'

// @antdv-next/x 的 CodeHighlighter（Shiki）按需加载语言
import { setupCodeHighlighter } from '@antdv-next/x'
import type { LanguageInput } from 'shiki'

const languageAliases: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  md: 'markdown',
  'c++': 'cpp',
  'c#': 'csharp',
}

const languageLoaders: Record<string, () => Promise<{ default: unknown }>> = {
  typescript: () => import('shiki/dist/langs/typescript.mjs'),
  javascript: () => import('shiki/dist/langs/javascript.mjs'),
  jsx: () => import('shiki/dist/langs/jsx.mjs'),
  tsx: () => import('shiki/dist/langs/tsx.mjs'),
  json: () => import('shiki/dist/langs/json.mjs'),
  bash: () => import('shiki/dist/langs/bash.mjs'),
  python: () => import('shiki/dist/langs/python.mjs'),
  html: () => import('shiki/dist/langs/html.mjs'),
  css: () => import('shiki/dist/langs/css.mjs'),
  vue: () => import('shiki/dist/langs/vue.mjs'),
  markdown: () => import('shiki/dist/langs/markdown.mjs'),
  yaml: () => import('shiki/dist/langs/yaml.mjs'),
  sql: () => import('shiki/dist/langs/sql.mjs'),
  go: () => import('shiki/dist/langs/go.mjs'),
  rust: () => import('shiki/dist/langs/rust.mjs'),
  java: () => import('shiki/dist/langs/java.mjs'),
  c: () => import('shiki/dist/langs/c.mjs'),
  cpp: () => import('shiki/dist/langs/cpp.mjs'),
  diff: () => import('shiki/dist/langs/diff.mjs'),
}

setupCodeHighlighter({
  loadLanguage: async (language) => {
    const normalized = languageAliases[language] ?? language
    const loader = languageLoaders[normalized]
    return loader ? ((await loader()).default as LanguageInput) : null
  },
})

createApp(App).mount('#app')
