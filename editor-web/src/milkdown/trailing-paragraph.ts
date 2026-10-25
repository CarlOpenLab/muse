/**
 * 文档末尾始终保留一个可编辑段落（Typora 式）：Markdown 解析会吞掉尾部
 * 空行，"只有标题"的文件解析后最后一个块是 heading——正文区没有节点，
 * 点不出光标也看不到正文占位。末块不是段落时补一个空段落。
 */
import { Plugin } from '@milkdown/prose/state';

export function trailingParagraphPlugin() {
  return new Plugin({
    appendTransaction(_transactions, _oldState, newState) {
      const last = newState.doc.lastChild;
      if (last && last.type.name === 'paragraph') return null;
      const paragraph = newState.schema.nodes.paragraph.create();
      return newState.tr.insert(newState.doc.content.size, paragraph);
    },
  });
}
