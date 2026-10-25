/**
 * 空内容占位符（参照 Textus 的 placeholder-plugin，扩展到标题/正文两处）：
 * - 空标题显示「写下标题…」——用户还没打字时引导落点；
 * - 空段落：整篇无任何文字时显示「在此落笔…」；文档已有内容时只在
 *   最后一个空段落显示「继续书写…」（中途的空行不提示）。
 * 用 node decoration 加 data-placeholder，CSS ::before 画出灰字，
 * 光标与占位符重叠不受影响（float + height:0）。
 */
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

const placeholderKey = new PluginKey('muse-placeholder');

export const PLACEHOLDER_TEXTS = {
  heading: '写下标题…',
  blank: '在此落笔…',
} as const;

/** Document holds no text at all (a brand-new or fully cleared doc). */
function isDocBlank(doc: ProseNode): boolean {
  return doc.textContent.trim() === '';
}

/** A pristine blank document: nothing but empty headings/paragraphs. Such a
 *  doc serializes to "" so a never-typed file is saved empty, and an empty
 *  file reopens as the same two-line template (title slot + body slot). */
export function isBlankTemplate(doc: ProseNode): boolean {
  if (doc.textContent.trim() !== '') return false;
  let ok = true;
  doc.forEach((node) => {
    const t = node.type.name;
    if (t !== 'paragraph' && t !== 'heading') ok = false;
    else if (node.content.size !== 0) ok = false;
  });
  return ok;
}

/** The node is a plain paragraph — typing "# " turns it into an empty
 *  heading via an input rule, and that heading must keep its own hint
 *  instead of the body's. A paragraph hint only guides the initial state:
 *  a fully blank document. Empty lines in a written document stay clean
 *  (Typora's restraint) — no 继续书写 noise after every Enter. */
function emptyBlockHint(node: ProseNode, doc: ProseNode): string | null {
  if (node.type.name === 'heading') return PLACEHOLDER_TEXTS.heading;
  if (node.type.name !== 'paragraph') return null;
  if (isDocBlank(doc)) return PLACEHOLDER_TEXTS.blank;
  return null;
}

export function createPlaceholderPlugin() {
  return $prose(
    () =>
      new Plugin({
        key: placeholderKey,
        props: {
          decorations(state) {
            const doc = state.doc;
            const decos: Decoration[] = [];
            doc.forEach((node, offset) => {
              if (node.content.size !== 0) return;
              const hint = emptyBlockHint(node, doc);
              if (!hint) return;
              decos.push(
                Decoration.node(offset, offset + node.nodeSize, {
                  class: 'empty-node',
                  'data-placeholder': hint,
                }),
              );
            });
            if (decos.length === 0) return DecorationSet.empty;
            return DecorationSet.create(doc, decos);
          },
        },
      }),
  );
}
