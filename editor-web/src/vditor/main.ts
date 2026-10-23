/**
 * M0 PoC canvas — Vditor 4 in `wysiwyg` mode (RFC-001 方案 C / §4.2 M0).
 * Implements the shared CanvasEditor surface over Vditor's public API.
 */
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import type { CanvasEditor } from '../canvasApi';
import { domSelectionOffset, fileToBase64 } from '../canvasApi';
import type { ThemeName } from '../bridge/protocol';

export const name = 'vditor' as const;
export const version = '4.0.1';

export async function create(el: HTMLElement): Promise<CanvasEditor> {
  const contentChangedCbs: Array<() => void> = [];
  const selectionCbs: Array<() => void> = [];
  const linkCbs: Array<(href: string) => void> = [];
  const pasteCbs: Array<(mime: string, base64: string) => void> = [];

  const vditor = new Vditor(el, {
    mode: 'wysiwyg',
    theme: 'dark',
    lang: 'zh_CN',
    value: '',
    placeholder: '开始写作…',
    cache: { enable: false },
    counter: { enable: false },
    toolbar: [],
    preview: { math: { inlineDigit: true } },
    upload: {
      // RFC §5.4: 图片粘贴/拖放 → web 侧只传字节，native 落盘
      handler(files: File[]): string {
        for (const f of files) {
          fileToBase64(f).then((b64) => {
            pasteCbs.forEach((cb) => cb(f.type || 'image/png', b64));
          });
        }
        return '';
      },
    },
  });

  // wait for vditor to finish async init (after() ran)
  await new Promise<void>((resolve) => {
    const check = () => {
      if (el.querySelector('.vditor-wysiwyg')) resolve();
      else setTimeout(check, 30);
    };
    check();
  });

  const wysiwygEl = () => el.querySelector<HTMLElement>('.vditor-wysiwyg');

  const root = wysiwygEl();
  let suppress = false; // document.set 不回发 document.changed（防回写循环）
  if (root) {
    root.addEventListener('input', () => {
      if (suppress) return;
      contentChangedCbs.forEach((cb) => cb());
    });
    root.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor) {
        e.preventDefault();
        linkCbs.forEach((cb) => cb(anchor.getAttribute('href') ?? ''));
      }
    });
  }
  document.addEventListener('selectionchange', () => {
    if (root && root.contains(document.getSelection()?.anchorNode ?? null)) {
      selectionCbs.forEach((cb) => cb());
    }
  });

  const editor: CanvasEditor = {
    name,
    version,
    getMarkdown: () => String(vditor.getValue() ?? ''),
    setMarkdown: (md) => {
      suppress = true;
      vditor.setValue(md);
      suppress = false;
    },
    setTheme: (theme: ThemeName) => {
      // vditor 的主题枚举是 'classic' | 'dark'，'light' 映射到 'classic'
      const vTheme = theme === 'dark' ? 'dark' : 'classic';
      try {
        vditor.setTheme(vTheme, theme === 'dark' ? 'dark' : 'light', theme === 'dark' ? 'github-dark' : 'github', theme === 'dark' ? 'dark' : 'light');
      } catch {
        vditor.setTheme(vTheme);
      }
    },
    getSelection: () => domSelectionOffset(root ?? el),
    runCommand: (cmd, args) => {
      const v = vditor as unknown as {
        vditor?: { undo?: { undo?: (v: unknown) => void; redo?: (v: unknown) => void } };
      };
      switch (cmd) {
        case 'focus':
          vditor.focus();
          return true;
        case 'undo':
          try {
            v.vditor?.undo?.undo?.(v.vditor);
            return true;
          } catch {
            return false;
          }
        case 'redo':
          try {
            v.vditor?.undo?.redo?.(v.vditor);
            return true;
          } catch {
            return false;
          }
        case 'selectAll':
          wysiwygEl()?.focus();
          document.execCommand('selectAll');
          return true;
        case 'insertMarkdown':
          vditor.insertValue(String(args.markdown ?? ''), true);
          contentChangedCbs.forEach((cb) => cb());
          return true;
        case 'replaceSelection':
          wysiwygEl()?.focus();
          document.execCommand('selectAll');
          vditor.insertValue(String(args.markdown ?? ''), true);
          contentChangedCbs.forEach((cb) => cb());
          return true;
        case 'requestSave':
          return false; // handled by the bridge itself
        default:
          return false;
      }
    },
    onContentChanged: (cb) => contentChangedCbs.push(cb),
    onSelectionChanged: (cb) => selectionCbs.push(cb),
    onLinkOpen: (cb) => linkCbs.push(cb),
    onImagePaste: (cb) => pasteCbs.push(cb),
  };

  return editor;
}
