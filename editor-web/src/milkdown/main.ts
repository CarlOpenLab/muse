/**
 * M0.5 PoC canvas — Milkdown 7.22 (ProseMirror) (RFC-001 方案 B / §4.2 M0.5).
 * Same CanvasEditor surface: commonmark + gfm + history + math + listener.
 */
import {
  Editor,
  editorViewCtx,
  parserCtx,
  rootCtx,
  defaultValueCtx,
  editorViewOptionsCtx,
} from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history, undoCommand, redoCommand } from '@milkdown/plugin-history';
import { math } from '@milkdown/plugin-math';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { callCommand, getMarkdown, replaceAll } from '@milkdown/utils';
import { AllSelection } from '@milkdown/prose/state';
import { Slice } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import 'prosemirror-view/style/prosemirror.css';
import 'katex/dist/katex.min.css';
import { createPlaceholderPlugin } from './placeholder';
import type { CanvasEditor } from '../canvasApi';
import type { ThemeName } from '../bridge/protocol';

export const name = 'milkdown' as const;
export const version = '7.22.3';

export async function create(el: HTMLElement): Promise<CanvasEditor> {
  const contentChangedCbs: Array<() => void> = [];
  const selectionCbs: Array<() => void> = [];
  const linkCbs: Array<(href: string) => void> = [];
  const pasteCbs: Array<(mime: string, base64: string) => void> = [];
  // markdownUpdated 在 replaceAll 之后异步触发，用时间窗抑制（document.set 不回发）
  let suppressUntil = 0;

  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, el);
      ctx.set(defaultValueCtx, '');
      ctx.get(listenerCtx).markdownUpdated((_ctx, _markdown, _prev) => {
        if (Date.now() < suppressUntil) return;
        contentChangedCbs.forEach((cb) => cb());
      });
      ctx.update(editorViewOptionsCtx, (prev) => ({
        ...prev,
        attributes: { ...(prev.attributes ?? {}), class: 'muse-prose', spellcheck: 'false' },
      }));
    })
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(math)
    .use(listener)
    .use(createPlaceholderPlugin())
    .create();

  const run = <T>(fn: (view: EditorView) => T): T | false => {
    try {
      return editor.action((ctx) => fn(ctx.get(editorViewCtx)));
    } catch {
      return false;
    }
  };

  el.addEventListener('paste', (e: ClipboardEvent) => {
    const dt = e.clipboardData;
    if (!dt) return;
    for (const item of Array.from(dt.items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (!f) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result);
          pasteCbs.forEach((cb) =>
            cb(f.type || 'image/png', result.slice(result.indexOf(',') + 1)),
          );
        };
        reader.readAsDataURL(f);
      }
    }
  });
  el.addEventListener('dblclick', (e) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (anchor) {
      e.preventDefault();
      linkCbs.forEach((cb) => cb(anchor.getAttribute('href') ?? ''));
    }
  });
  document.addEventListener('selectionchange', () => {
    if (el.contains(document.getSelection()?.anchorNode ?? null)) {
      selectionCbs.forEach((cb) => cb());
    }
  });

  const editorApi: CanvasEditor = {
    name,
    version,
    getMarkdown: () => editor.action(getMarkdown()) ?? '',
    setMarkdown: (md) => {
      // RFC §5.3: document.set 不产生 document.changed（防回写循环）
      suppressUntil = Date.now() + 400;
      editor.action(replaceAll(md));
    },
    setTheme: (_theme: ThemeName) => {
      // tokens are applied globally via CSS variables (theme/tokens.ts)
    },
    getSelection: () => {
      const result = run((view) => {
        const { from, to } = view.state.selection;
        return {
          from: view.state.doc.textBetween(0, from, '\n').length,
          to: view.state.doc.textBetween(0, to, '\n').length,
          text: view.state.doc.textBetween(from, to, '\n'),
        };
      });
      return result === false ? { from: -1, to: -1, text: '' } : result;
    },
    runCommand: (cmd, args) => {
      switch (cmd) {
        case 'focus':
          return run((view) => {
            view.focus();
            return true;
          }) === true;
        case 'undo':
          return run(() => {
            editor.action(callCommand(undoCommand.key));
            return true;
          }) === true;
        case 'redo':
          return run(() => {
            editor.action(callCommand(redoCommand.key));
            return true;
          }) === true;
        case 'selectAll':
          return run((view) => {
            view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
            view.focus();
            return true;
          }) === true;
        case 'insertMarkdown':
        case 'replaceSelection':
          return (
            run((view) => {
              const md = String(args.markdown ?? '');
              const node = editor.action((ctx) => ctx.get(parserCtx)(md));
              if (!node) return false;
              view.dispatch(
                view.state.tr
                  .replaceSelection(new Slice(node.content, 0, 0))
                  .scrollIntoView(),
              );
              view.focus();
              return true;
            }) === true
          );
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

  return editorApi;
}
