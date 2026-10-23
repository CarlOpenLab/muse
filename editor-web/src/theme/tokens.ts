/**
 * Muse canvas theme tokens — lifted from native/nativeui/app.go applyTheme().
 * The host sends theme.set{theme, tokens}; the canvas maps them to CSS vars.
 */
import type { ThemeName } from '../bridge/protocol';

export interface MuseTokens {
  window: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
  selection: string;
}

export const TOKENS: Record<ThemeName, MuseTokens> = {
  dark: {
    window: '#1a1a1a',
    background: '#232328',
    surface: '#2a2a30',
    text: '#ececf0',
    muted: '#a9a9b4',
    accent: '#6b93ff',
    border: 'rgba(255,255,255,0.07)',
    selection: 'rgba(107,147,255,0.28)',
  },
  light: {
    window: '#f5f5f5',
    background: '#ffffff',
    surface: '#f3f3f6',
    text: '#1d1d1f',
    muted: '#6e6e78',
    accent: '#3b6cf6',
    border: 'rgba(0,0,0,0.07)',
    selection: 'rgba(59,108,246,0.25)',
  },
};

export function applyTokens(theme: ThemeName, overrides?: Record<string, string>): void {
  const t = TOKENS[theme];
  const root = document.documentElement;
  root.dataset.theme = theme;
  const map: Record<string, string> = {
    '--muse-window': t.window,
    '--muse-bg': t.background,
    '--muse-surface': t.surface,
    '--muse-text': t.text,
    '--muse-muted': t.muted,
    '--muse-accent': t.accent,
    '--muse-border': t.border,
    '--muse-selection': t.selection,
    ...overrides,
  };
  for (const [k, v] of Object.entries(map)) root.style.setProperty(k, v);
}
