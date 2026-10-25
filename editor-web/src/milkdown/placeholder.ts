/**
 * 空内容占位符（参照 Textus 的 placeholder-plugin，扩展到标题/正文两处）：
 * - 空标题显示「标题」——用户还没打字时引导落点；
 * - 空段落：整篇无任何文字时显示「开始写作…」；文档已有内容时只在
 *   最后一个空段落显示「输入正文…」（中途的空行不提示）。
 * 用 node decoration 加 data-placeholder，CSS ::before 画出灰字，
 * 光标与占位符重叠不受影响（float + height:0）。
 */
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

const placeholderKey = new PluginKey('muse-placeholder');

export const PLACEHOLDER_TEXTS = {
  heading: '标题',
  body: '输入正文…',
  blank: '开始写作…',
} as const;

/** Document holds no text at all (a brand-new or fully cleared doc). */
function isDocBlank(doc: ProseNode): boolean {
  return doc.textContent.trim() === '';
}

/** The node is a plain paragraph — typing "# " turns it into an empty
 *  heading via an input rule, and that heading must keep its own hint
 *  instead of the body's. */
function emptyBlockHint(node: ProseNode, doc: ProseNode, isLast: boolean): string | null {
  if (node.type.name === 'heading') return PLACEHOLDER_TEXTS.heading;
  if (node.type.name !== 'paragraph') return null;
  if (isDocBlank(doc)) return PLACEHOLDER_TEXTS.blank;
  return isLast ? PLACEHOLDER_TEXTS.body : null;
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
              const hint = emptyBlockHint(node, doc, offset + node.nodeSize === doc.content.size);
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
