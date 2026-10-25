/**
 * RFC-001 §5.2 protocol conformance — runs the WebBridge in jsdom with an
 * in-memory host, the same contract the Go/WKWebView host must satisfy.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebBridge } from '../src/bridge/webBridge';
import type { NativeToWeb, WebToNative } from '../src/bridge/protocol';

function harnessBridge(trace?: (m: WebToNative) => void) {
  const sent: WebToNative[] = [];
  const bridge = new WebBridge({
    editorName: 'milkdown',
    editorVersion: '7.22.3',
    getMarkdown: () => '# doc',
    runCommand: (name) => name !== 'nope',
    setDocument: vi.fn(),
    setTheme: vi.fn(),
    getSelection: () => ({ from: 3, to: 9, text: 'sel' }),
    onTrace: (_dir, msg) => {
      if (trace && (msg as WebToNative).type) trace(msg as WebToNative);
    },
  });
  window.addEventListener('muse:outbox', (e) => {
    sent.push(JSON.parse((e as CustomEvent<{ raw: string }>).detail.raw));
  });
  return { bridge, sent };
}

const inbox = (bridge: WebBridge, msg: NativeToWeb) => bridge.receive(JSON.stringify(msg));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('bridge handshake', () => {
  it('emits ready with editor identity on start', () => {
    const { bridge, sent } = harnessBridge();
    bridge.start();
    expect(sent[0]).toMatchObject({ type: 'ready', editor: 'milkdown', version: '7.22.3' });
  });
});

describe('document.changed', () => {
  it('debounces bursts into the last message (RFC: 150–250ms)', () => {
    const { bridge, sent } = harnessBridge();
    bridge.start();
    sent.length = 0;

    bridge.contentChanged('a');
    vi.advanceTimersByTime(120);
    bridge.contentChanged('ab');
    vi.advanceTimersByTime(120);
    expect(sent).toHaveLength(0); // still inside the debounce window

    vi.advanceTimersByTime(120);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'document.changed', markdown: 'ab' });
  });

  it('increments revision above the last document.set', () => {
    const { bridge, sent } = harnessBridge();
    bridge.start();
    inbox(bridge, { type: 'document.set', path: 'p', markdown: 'x', revision: 12, theme: 'dark' });
    sent.length = 0;

    bridge.contentChanged('y');
    vi.advanceTimersByTime(300);
    expect(sent[0]).toMatchObject({ type: 'document.changed', markdown: 'y', revision: 13 });
  });

  it('save flushes pending changes without waiting for the debounce', () => {
    const { bridge, sent } = harnessBridge();
    bridge.start();
    sent.length = 0;

    bridge.contentChanged('draft');
    bridge.requestSave();
    expect(sent.some((m) => m.type === 'document.saveRequested')).toBe(true);
    const save = sent.find((m) => m.type === 'document.saveRequested');
    expect((save as { markdown: string }).markdown).toBe('draft');

    // after flushing, the debounce must not double-send
    vi.advanceTimersByTime(400);
    expect(sent.filter((m) => m.type === 'document.changed')).toHaveLength(0);
  });
});

describe('native requests', () => {
  it('selection.get is answered with the same id (RFC: 每个请求带 id)', () => {
    const { bridge, sent } = harnessBridge();
    bridge.start();
    sent.length = 0;

    inbox(bridge, { type: 'selection.get', id: 7 });
    const reply = sent.find((m) => m.type === 'selection.changed') as {
      id: number;
      from: number;
      to: number;
      text: string;
    };
    expect(reply).toMatchObject({ id: 7, from: 3, to: 9, text: 'sel' });
  });

  it('commands echo a command.reply with ok', () => {
    const { bridge, sent } = harnessBridge();
    bridge.start();
    sent.length = 0;

    inbox(bridge, { type: 'command', name: 'focus', id: 1 });
    expect(sent).toContainEqual(
      expect.objectContaining({ type: 'command.reply', id: 1, ok: true }),
    );

    inbox(bridge, { type: 'command', name: 'nope' as 'focus', id: 2 });
    expect(sent).toContainEqual(
      expect.objectContaining({ type: 'command.reply', id: 2, ok: false }),
    );
  });

  it('routes document.set to the canvas and adopts the host revision', () => {
    const setDocument = vi.fn();
    const setTheme = vi.fn();
    const bridge = new WebBridge({
      editorName: 'vditor',
      editorVersion: '4.0.1',
      getMarkdown: () => '',
      runCommand: () => true,
      setDocument,
      setTheme,
      getSelection: () => ({ from: 0, to: 0, text: '' }),
    });
    bridge.start();
    inbox(bridge, { type: 'document.set', path: 'a.md', markdown: 'md', revision: 5, theme: 'light' });
    expect(setDocument).toHaveBeenCalledWith('md');
    expect(setTheme).toHaveBeenCalledWith('light', undefined);
  });

  it('ignores unparseable traffic instead of throwing', () => {
    const { bridge } = harnessBridge();
    expect(() => bridge.receive('not json')).not.toThrow();
  });
});
