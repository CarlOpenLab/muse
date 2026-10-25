/** Uniform canvas API both PoC editors implement, per RFC-001 §5.2/§5.4. */
import type { ThemeName } from './bridge/protocol';

/** 顶层块信息，供右侧结构导航 rail 使用。 */
export interface BlockInfo {
  from: number;
  len: number;
  kind: string;
  /** 块内纯文本（空白折叠），rail 预览卡截 56/88 字用。 */
  text: string;
}

export interface CanvasEditor {
  name: 'vditor' | 'milkdown';
  version: string;
  getMarkdown(): string;
  setMarkdown(md: string): void;
  runCommand(name: string, args: Record<string, unknown>): boolean;
  getSelection(): { from: number; to: number; text: string };
  setTheme(theme: ThemeName): void;
  /** 顶层块列表（结构导航 rail）。 */
  getBlocks?(): BlockInfo[];
  /** 当前视口中心所在的块序号。 */
  getActiveBlock?(): number;
  /** 每次文档事务（含 document.set）后的本地通知，与桥抑制无关。 */
  onDocChanged?(cb: () => void): () => void;
  onContentChanged(cb: () => void): void;
  onSelectionChanged(cb: () => void): void;
  onLinkOpen(cb: (href: string) => void): void;
  onImagePaste(cb: (mime: string, base64: string) => void): void;
  destroy?(): void;
}

/** Caret/selection offset inside a contenteditable, counted in plain text. */
export function domSelectionOffset(root: HTMLElement): { from: number; to: number; text: string } {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
    return { from: -1, to: -1, text: '' };
  }
  const range = sel.getRangeAt(0);
  const measure = (node: Node | null, offset: number): number => {
    if (!node) return -1;
    const pre = document.createRange();
    pre.selectNodeContents(root);
    try {
      pre.setEnd(node, offset);
    } catch {
      return -1;
    }
    return pre.toString().length;
  };
  return {
    from: measure(range.startContainer, range.startOffset),
    to: measure(range.endContainer, range.endOffset),
    text: sel.toString(),
  };
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
