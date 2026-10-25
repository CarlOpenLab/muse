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
import { $prose, callCommand, getMarkdown, replaceAll } from '@milkdown/utils';
import { AllSelection, Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { Fragment, Slice } from '@milkdown/prose/model';
import type { EditorView } from '@milkdown/prose/view';
import 'prosemirror-view/style/prosemirror.css';
import 'katex/dist/katex.min.css';
import { blankStructurePlugin, createPlaceholderPlugin, isBlankTemplate } from './placeholder';
import { trailingParagraphPlugin } from './trailing-paragraph';
import type { BlockInfo, CanvasEditor } from '../canvasApi';
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

  // 文档事务通知（含 document.set/模板应用）——rail 刷新等本地 UI 用，
  // 不走 markdownUpdated（那里有桥抑制窗口）。
  const docChangedCbs: Array<() => void> = [];
  const docChangePlugin = new Plugin({
    view: () => ({
      // 第二参是前一 EditorState（不是事务）：文档引用变化即内容变了。
      update: (view, prevState) => {
        if (view.state.doc !== prevState.doc) docChangedCbs.forEach((cb) => cb());
      },
    }),
  });

  // 搜索命中临时高亮：scrollToText 命中的文本段加 1.8s 的 .muse-search-hit。
  const hitKey = new PluginKey<DecorationSet>('muse-hit');
  let hitTimer: ReturnType<typeof setTimeout> | null = null;
  const hitPlugin = new Plugin({
    key: hitKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, old) {
        const meta = tr.getMeta(hitKey) as DecorationSet | undefined;
        return meta ?? old;
      },
    },
    props: {
      decorations(state) {
        return hitKey.getState(state);
      },
    },
  });
  const setHit = (view: EditorView, from: number, to: number) => {
    view.dispatch(
      view.state.tr.setMeta(hitKey, DecorationSet.create(view.state.doc, [
        Decoration.inline(from, to, { class: 'muse-search-hit' }),
      ])),
    );
    if (hitTimer) clearTimeout(hitTimer);
    hitTimer = setTimeout(() => {
      hitTimer = null;
      try {
        view.dispatch(view.state.tr.setMeta(hitKey, DecorationSet.empty));
      } catch {
        /* view 已销毁 */
      }
    }, 1800);
  };

  // 平滑滚到指定文档位置：先落选区，再按坐标对画布做 smooth 滚动。

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
    .use(blankStructurePlugin())
    .use($prose(() => trailingParagraphPlugin()))
    .use($prose(() => hitPlugin))
    .use($prose(() => docChangePlugin))
    .create();

  const run = <T>(fn: (view: EditorView) => T): T | false => {
    try {
      return editor.action((ctx) => fn(ctx.get(editorViewCtx)));
    } catch {
      return false;
    }
  };

  // 空文档模板：空标题 + 空段落——标题位与正文位各有独立占位（Typora 式）。
  // 序列化时整篇仍为 ""，存盘不产生 "# " 垃圾。
  const applyBlankTemplate = () => {
    suppressUntil = Date.now() + 400;
    run((view) => {
      const { schema } = view.state;
      const heading = schema.nodes.heading.create({ level: 1 });
      const paragraph = schema.nodes.paragraph.create();
      view.dispatch(
        view.state.tr.replaceWith(0, view.state.doc.content.size, Fragment.fromArray([heading, paragraph])),
      );
      return true;
    });
  };

  // 编辑器以单个空段落创建；没有宿主文档前先呈现双占位模板（标题位+正文位）。
  if (run((view) => isBlankTemplate(view.state.doc)) === true) {
    applyBlankTemplate();
  }




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

  const smoothScrollToPos = (view: EditorView, pos: number) => {
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos))));
    const coords = view.coordsAtPos(pos);
    const scroller = view.dom.closest('.muse-web-canvas') as HTMLElement | null;
    if (!scroller) return;
    const cRect = scroller.getBoundingClientRect();
    scroller.scrollTo({ top: scroller.scrollTop + (coords.top - cRect.top) - 24, behavior: 'smooth' });
  };

  // 顶层块列表 + 视口中心所在块（结构导航 rail 的数据源）。
  const topBlocks = (view: EditorView): BlockInfo[] => {
    const out: BlockInfo[] = [];
    view.state.doc.forEach((node, offset) => {
      out.push({ from: offset, len: Math.max(node.textContent.length, 12), kind: node.type.name });
    });
    return out;
  };

  const editorApi: CanvasEditor = {
    name,
    version,
    getMarkdown: () => {
      const md = editor.action(getMarkdown()) ?? '';
      // 纯空标题/空段落组成的文档按空文件存取，空文件打开也回到双占位模板。
      if (editor.action((ctx) => isBlankTemplate(ctx.get(editorViewCtx).state.doc))) return '';
      return md;
    },
    setMarkdown: (md) => {
      // RFC §5.3: document.set 不产生 document.changed（防回写循环）
      suppressUntil = Date.now() + 400;
      if (md.trim() === '') {
        applyBlankTemplate();
        return;
      }
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
    getBlocks: () => run(topBlocks) || [],
  onDocChanged: (cb) => {
    docChangedCbs.push(cb);
    return () => {
      const i = docChangedCbs.indexOf(cb);
      if (i >= 0) docChangedCbs.splice(i, 1);
    };
  },
  getActiveBlock: () =>
    run((view) => {
      const blocks = topBlocks(view);
      if (blocks.length === 0) return -1;
      const domRect = view.dom.getBoundingClientRect();
      const mid = domRect.top + domRect.height / 2;
      let active = 0;
      blocks.forEach((b, i) => {
        try {
          if (view.coordsAtPos(b.from).top <= mid) active = i;
        } catch {
          /* 位置越界忽略 */
        }
      });
      return active;
    }) ?? 0,
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
        case 'scrollToText': {
          const needle = String((args as { text?: string }).text ?? '').trim().toLowerCase();
          return (
            run((view) => {
              if (!needle) return false;
              let target = -1;
              view.state.doc.descendants((node, pos) => {
                if (target < 0 && node.isText && node.text && node.text.toLowerCase().includes(needle)) {
                  target = pos;
                }
                return target < 0;
              });
              if (target < 0) return false;
              smoothScrollToPos(view, target);
              // 命中段临时高亮
              const node = view.state.doc.nodeAt(target);
              const idx = (node?.text ?? '').toLowerCase().indexOf(needle);
              if (node && idx >= 0) {
                setHit(view, target + idx, target + idx + needle.length);
              }
              view.focus();
              return true;
            }) === true
          );
        }
        case 'scrollToBlock': {
          const pos = Number((args as { pos?: number }).pos ?? -1);
          return (
            run((view) => {
              if (pos < 0 || pos > view.state.doc.content.size) return false;
              smoothScrollToPos(view, pos);
              view.focus();
              return true;
            }) === true
          );
        }
        case 'scrollToHeading': {
          const text = String((args as { text?: string }).text ?? '').trim();
          return (
            run((view) => {
              let target = -1;
              view.state.doc.descendants((node, pos) => {
                if (target < 0 && node.type.name === 'heading' && node.textContent.trim() === text) {
                  target = pos;
                }
                return target < 0;
              });
              if (target < 0) return false;
              smoothScrollToPos(view, target + 1);
              view.focus();
              return true;
            }) === true
          );
        }
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
