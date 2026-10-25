/**
 * Web side of the RFC-001 §5.2 bridge.
 *
 * Transports, in priority order:
 *  1. Real host — `window.webkit.messageHandlers.museNative.postMessage(msg)`
 *     (macOS WKScriptMessageHandler named `museNative`; native replies arrive
 *     via `window.museNativeCallback(id, payload)`).
 *  2. Harness — an in-page simulator (`?harness=1`) that plays the native
 *     role so the whole protocol can be exercised in a plain browser.
 */
import {
  DOCUMENT_CHANGED_DEBOUNCE_MS,
  ThemeName,
  WebToNative,
  NativeToWeb,
  isNativeToWeb,
} from './protocol';

type Listener = (msg: NativeToWeb) => void;

interface WebKitHost {
  messageHandlers: { museNative: { postMessage(msg: string): void } };
}

/** MyGo's injected runtime (internal/bridge/bridge.js): window.mygo IS the
 *  runtime — calls bound Go methods as promises, delivers Go events by
 *  name. Transport #0 below. */
export interface MygoRuntime {
  call(method: string, ...args: unknown[]): Promise<unknown>;
  on(name: string, fn: (payload: unknown) => void): () => void;
}

declare global {
  interface Window {
    webkit?: WebKitHost;
    museNativeCallback?: (id: number, payload: unknown) => void;
    mygo?: MygoRuntime;
  }
}

export interface BridgeOptions {
  editorName: 'vditor' | 'milkdown';
  editorVersion: string;
  /** Called when the web side wants the current markdown for a save. */
  getMarkdown: () => string;
  /** Execute a native→web command; returns true when handled. */
  runCommand: (name: string, args: Record<string, unknown>) => boolean;
  /** Load a document handed over by the host. */
  setDocument: (markdown: string) => void;
  /** Apply a theme from the host. */
  setTheme: (theme: ThemeName, tokens?: Record<string, string>) => void;
  /** Current selection accessor for selection.get replies. */
  getSelection: () => { from: number; to: number; text: string };
  /** Receive harness/debug traffic (never wired in a real release). */
  onTrace?: (dir: '→ native' | '← native', msg: unknown) => void;
}

export class WebBridge {
  private listeners = new Set<Listener>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanged: string | null = null;
  /** Revision of the last document.set received from native. */
  private baseRevision = 0;
  /** Latest local revision we have reported. */
  private localRevision = 0;
  private ready = false;

  constructor(private opts: BridgeOptions) {}

  /** Wire the transport and emit `ready`. Call once after the editor mounts. */
  start(): void {
    if (window.mygo) {
      // MyGo WebView host: Go emits the RFC protocol messages as one event;
      // we answer through bound Go methods (see mygoSend).
      window.mygo.on('muse:bridge', (payload) => this.receive(payload as NativeToWeb));
    } else if (window.webkit?.messageHandlers?.museNative) {
      // Real host: native pushes messages by evaluating museHandle(msg).
      (window as unknown as { museHandle: (raw: string) => void }).museHandle = (
        raw: string,
      ) => this.receive(raw);
    } else {
      // Harness transport: the simulator reads our outbox directly.
      const sim = (window as unknown as { __museSim?: { deliver: (raw: string) => void } })
        .__museSim;
      window.addEventListener('muse:outbox', (e) => {
        const detail = (e as CustomEvent<{ raw: string }>).detail.raw;
        sim?.deliver(detail);
      });
    }
    this.ready = true;
    this.send({
      type: 'ready',
      editor: this.opts.editorName,
      version: this.opts.editorVersion,
    });
  }

  /** Web → Native send. */
  send(msg: WebToNative): void {
    this.opts.onTrace?.('→ native', msg);
    if (this.mygoSend(msg)) return;
    const raw = JSON.stringify(msg);
    const host = window.webkit?.messageHandlers?.museNative;
    if (host) {
      host.postMessage(raw);
    } else {
      window.dispatchEvent(new CustomEvent('muse:outbox', { detail: { raw } }));
    }
  }

  /** MyGo transport: one bound Go method per protocol message. */
  private mygoSend(msg: WebToNative): boolean {
    const r = window.mygo;
    if (!r) return false;
    switch (msg.type) {
      case 'ready':
        void r.call('Muse.Ready', msg.editor, msg.version);
        break;
      case 'document.changed':
        void r.call('Muse.DocumentChanged', msg.markdown, msg.revision);
        break;
      case 'document.saveRequested':
        void r.call('Muse.SaveRequested', msg.markdown);
        break;
      case 'selection.changed':
        if ('id' in msg && msg.id !== undefined) {
          void r.call('Muse.SelectionReply', msg.id, msg.from, msg.to, msg.text);
        } else {
          void r.call('Muse.SelectionChanged', msg.from, msg.to, msg.text);
        }
        break;
      case 'link.open':
        void r.call('Muse.OpenLink', msg.href);
        break;
      case 'image.paste':
        void r.call('Muse.ImagePaste', msg.mime, msg.base64);
        break;
      case 'command.reply':
        void r.call('Muse.CommandReply', msg.id, msg.ok, msg.error ?? '');
        break;
    }
    return true;
  }

  /** Debounced content change (RFC: 150–250ms, guards with revision). */
  contentChanged(markdown: string): void {
    this.pendingChanged = markdown;
    this.localRevision = this.baseRevision + 1;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      const md = this.pendingChanged;
      this.pendingChanged = null;
      if (md === null) return;
      this.send({ type: 'document.changed', markdown: md, revision: this.localRevision });
    }, DOCUMENT_CHANGED_DEBOUNCE_MS);
  }

  /** Called by the editor when the caret/selection moves. */
  selectionChanged(sel: { from: number; to: number; text: string }): void {
    this.send({ type: 'selection.changed', from: sel.from, to: sel.to, text: sel.text });
  }

  linkOpen(href: string): void {
    this.send({ type: 'link.open', href });
  }

  imagePaste(mime: string, base64: string): void {
    this.send({ type: 'image.paste', mime, base64 });
  }

  /**
   * RFC: "保存时 native 主动 selection.get / document.get，不依赖最后一次变更事件".
   * The host triggers saveRequested; the web side attaches fresh markdown.
   */
  requestSave(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    const md = this.pendingChanged ?? this.opts.getMarkdown();
    this.pendingChanged = null;
    this.send({ type: 'document.saveRequested', markdown: md });
  }

  /** Native → Web entry point. */
  receive(raw: string | NativeToWeb): void {
    let msg: NativeToWeb;
    try {
      msg = typeof raw === 'string' ? (JSON.parse(raw) as NativeToWeb) : raw;
    } catch {
      this.opts.onTrace?.('← native', { error: 'unparseable message', raw });
      return;
    }
    if (!isNativeToWeb(msg)) {
      this.opts.onTrace?.('← native', { error: 'unknown message type', raw: msg });
      return;
    }
    this.opts.onTrace?.('← native', msg);
    switch (msg.type) {
      case 'document.set': {
        this.baseRevision = msg.revision;
        this.localRevision = msg.revision;
        if (msg.theme) this.opts.setTheme(msg.theme, msg.tokens);
        // markdown 缺失（Go omitempty 曾丢空串）按空文档处理，
        // 绝不把 undefined 递给画布、让它停留在上一个文件。
        this.opts.setDocument(msg.markdown ?? '');
        break;
      }
      case 'theme.set': {
        this.opts.setTheme(msg.theme, msg.tokens);
        break;
      }
      case 'command': {
        let ok = false;
        try {
          ok = this.opts.runCommand(msg.name, msg.args ?? {});
        } catch (err) {
          if (msg.id !== undefined) {
            this.send({ type: 'command.reply', id: msg.id, ok: false, error: String(err) });
            return;
          }
        }
        if (msg.id !== undefined) {
          this.send({ type: 'command.reply', id: msg.id, ok });
        }
        break;
      }
      case 'selection.get': {
        const sel = this.opts.getSelection();
        this.send({
          type: 'selection.changed',
          from: sel.from,
          to: sel.to,
          text: sel.text,
          id: msg.id,
          replyTo: 'selection.get',
        });
        break;
      }
    }
    this.listeners.forEach((fn) => fn(msg));
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  get isReady(): boolean {
    return this.ready;
  }

  get currentRevision(): number {
    return this.localRevision;
  }
}
