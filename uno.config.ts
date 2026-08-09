import { defineConfig, presetWind } from 'unocss'
import { presetAntd } from '@antdv-next/unocss'

/**
 * UnoCSS 配置。
 *
 * - `presetWind`：Tailwind v3 风格的 utility（flex / pt-* / rounded-* …）；
 * - 主题颜色映射到 `base.css` 的 CSS 变量：`bg-bg` / `text-fg` / `border-border`
 *   等会随 `<html>.dark` 类自动翻转，无需写两套。
 */
export default defineConfig({
  presets: [presetWind(), presetAntd()],
  theme: {
    colors: {
      bg: 'var(--bg)',
      'bg-soft': 'var(--bg-soft)',
      fg: 'var(--fg)',
      'fg-soft': 'var(--fg-soft)',
      border: 'var(--border)',
      'border-subtle': 'var(--border-subtle)',
      accent: 'var(--accent)',
      'code-bg': 'var(--code-bg)',
      'code-inline-bg': 'var(--code-inline-bg)',
      'page-bg': 'var(--page-bg)',
    },
  },
})
