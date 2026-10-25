import { describe, expect, it, vi } from 'vitest';
import { WebBridge } from '../src/bridge/webBridge';

// 回归：document.set 的 markdown 为空/缺失时，画布必须收到 "" 而不是
// undefined（Go omitempty 曾丢空串导致画布停留在上一个文件）。
describe('document.set with an empty payload', () => {
  it('hands "" to setDocument when markdown is missing', () => {
    const setDocument = vi.fn();
    const bridge = new WebBridge({
      editorName: 'milkdown',
      editorVersion: '7.22.3',
      getMarkdown: () => '',
      runCommand: () => false,
      setDocument,
      setTheme: () => {},
      getSelection: () => ({ from: 0, to: 0, text: '' }),
    });
    bridge.receive({ type: 'document.set', path: '/a.md', revision: 3, theme: 'dark' } as never);
    expect(setDocument).toHaveBeenCalledWith('');
  });
});
