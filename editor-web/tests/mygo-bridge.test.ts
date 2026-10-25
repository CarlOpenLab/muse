/**
 * MyGo transport of the RFC-001 §5.2 bridge: window.mygo.runtime.call maps
 * WebToNative messages onto bound "Muse.*" Go methods, and Go events named
 * "muse:bridge" arrive as NativeToWeb messages.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebBridge } from '../src/bridge/webBridge';
import type { MygoRuntime } from '../src/bridge/webBridge';
import type { NativeToWeb } from '../src/bridge/protocol';

interface Harness {
  calls: Array<{ method: string; args: unknown[] }>;
  emit: (payload: NativeToWeb) => void;
  runtime: MygoRuntime;
}

function installMygo(): Harness {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const listeners = new Set<(payload: unknown) => void>();
  const runtime: MygoRuntime = {
    call: (method, ...args) => {
      calls.push({ method, args });
      return Promise.resolve(null);
    },
    on: (_name, fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  (window as unknown as { mygo?: unknown }).mygo = runtime;
  return {
    calls,
    emit: (payload) => listeners.forEach((fn) => fn(payload)),
    runtime,
  };
}

function makeBridge() {
  const setDocument = vi.fn();
  const setTheme = vi.fn();
  const runCommand = vi.fn(() => true);
  const bridge = new WebBridge({
    editorName: 'milkdown',
    editorVersion: '7.22.3',
    getMarkdown: () => '# 新内容\n',
    runCommand,
    setDocument,
    setTheme,
    getSelection: () => ({ from: 0, to: 0, text: '' }),
  });
  return { bridge, setDocument, setTheme, runCommand };
}

describe('WebBridge over the MyGo runtime', () => {
  let h: Harness;

  beforeEach(() => {
    vi.useFakeTimers();
    h = installMygo();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { mygo?: unknown }).mygo;
  });

  it('reports ready through Muse.Ready', () => {
    const { bridge } = makeBridge();
    bridge.start();
    expect(h.calls).toEqual([{ method: 'Muse.Ready', args: ['milkdown', '7.22.3'] }]);
  });

  it('applies document.set and bumps the revision base', () => {
    const { bridge, setDocument, setTheme } = makeBridge();
    bridge.start();
    h.emit({
      type: 'document.set',
      path: '/tmp/a.md',
      markdown: '# 你好\n',
      revision: 4,
      theme: 'light',
    });
    expect(setDocument).toHaveBeenCalledWith('# 你好\n');
    expect(setTheme).toHaveBeenCalledWith('light', undefined);
    expect(bridge.currentRevision).toBe(4);
  });

  it('debounces edits into Muse.DocumentChanged with base+1', () => {
    const { bridge } = makeBridge();
    bridge.start();
    h.emit({ type: 'document.set', path: '', markdown: 'v1', revision: 7, theme: 'dark' });
    bridge.contentChanged('v1 改');
    vi.advanceTimersByTime(199);
    bridge.contentChanged('v1 改定');
    vi.advanceTimersByTime(201);
    expect(h.calls).toContainEqual({
      method: 'Muse.DocumentChanged',
      args: ['v1 改定', 8],
    });
  });

  it('answers requestSave with fresh markdown via Muse.SaveRequested', () => {
    const { bridge, runCommand } = makeBridge();
    bridge.start();
    h.emit({ type: 'command', name: 'requestSave' });
    expect(runCommand).toHaveBeenCalledWith('requestSave', {});
    bridge.requestSave();
    expect(h.calls).toContainEqual({ method: 'Muse.SaveRequested', args: ['# 新内容\n'] });
  });

  it('falls through to the harness transport when no runtime exists', () => {
    delete (window as unknown as { mygo?: unknown }).mygo;
    const outbox: string[] = [];
    window.addEventListener('muse:outbox', (e) => {
      outbox.push((e as CustomEvent<{ raw: string }>).detail.raw);
    });
    const { bridge } = makeBridge();
    bridge.start();
    bridge.linkOpen('https://muse.app');
    expect(outbox.map((raw) => JSON.parse(raw).type)).toEqual(['ready', 'link.open']);
    expect(h.calls).toEqual([]);
  });
});
