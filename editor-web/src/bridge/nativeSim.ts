/**
 * In-page simulator of the native host (RFC-001 §5.2 harness).
 *
 * It plays exactly the role the Go side will play behind
 * WKScriptMessageHandler, so the bridge protocol can be exercised and
 * verified in a plain browser before any macOS host exists. It is loaded
 * only with `?harness=1`.
 */
import type { NativeToWeb, WebToNative } from './protocol';
import { FIXTURES } from '../fixtures';

interface LogEntry {
  dir: 'in' | 'out';
  msg: NativeToWeb | WebToNative | { error: string };
  t: number;
}

let fixtureCursor = 0;

export class NativeSim {
  readonly log: LogEntry[] = [];
  markdown = '';
  revision = 7;
  theme: 'light' | 'dark' = 'dark';
  saves = 0;
  lastSaved: string | null = null;
  pastedCount = 0;
  lastPath?: string;
  private pendingSelectionGet: ((sel: unknown) => void) | null = null;
  private ui: {
    logEl: HTMLElement;
    stateEl: HTMLElement;
  };

  constructor(ui: { logEl: HTMLElement; stateEl: HTMLElement }) {
    this.ui = ui;
    (window as unknown as { __museSim: NativeSim }).__museSim = this;
  }

  /** Outbox events from WebBridge arrive here. */
  deliver(raw: string): void {
    let msg: WebToNative;
    try {
      msg = JSON.parse(raw) as WebToNative;
    } catch {
      this.push('in', { error: 'unparseable' });
      return;
    }
    this.push('in', msg);
    switch (msg.type) {
      case 'ready':
        // RFC 数据流: native 读文件 → document.set → web 渲染
        this.send({
          type: 'document.set',
          path: '~/Documents/缪斯笔记.md',
          markdown: FIXTURES.find((f) => f.id === 'mixed')!.markdown,
          revision: this.revision,
          theme: this.theme,
        });
        break;
      case 'document.changed':
        // 编辑只更新内存，不写盘（RFC §5.3）
        this.markdown = msg.markdown;
        this.revision = msg.revision;
        break;
      case 'selection.changed':
        break;
      case 'document.saveRequested':
        // 临时文件 + rename；成功后更新 revision（RFC §5.3）
        this.saves += 1;
        this.lastSaved = msg.markdown;
        this.revision += 1;
        break;
      case 'image.paste': {
        // native 落盘后把路径插回文档
        this.pastedCount += 1;
        const name = `pasted-${this.pastedCount}.png`;
        this.send({
          type: 'command',
          name: 'insertMarkdown',
          id: 100 + this.pastedCount,
          args: { markdown: `![${name}](assets/${name})` },
        });
        break;
      }
      case 'link.open':
        // 系统浏览器打开；WebView 不导航
        break;
      case 'command.reply':
      case 'selection.changed':
      case 'ready':
        break;
    }
    if ((msg as { replyTo?: string }).replyTo === 'selection.get') {
      this.pendingSelectionGet?.(msg);
      this.pendingSelectionGet = null;
    }
    this.renderState();
  }

  /** Native → Web send. */
  send(msg: NativeToWeb): void {
    if (msg.type === 'document.set') this.lastPath = msg.path;
    this.push('out', msg);
    window.dispatchEvent(new CustomEvent('muse:inbox', { detail: { msg } }));
  }

  /* ---- host actions exposed as buttons ---- */

  reloadDocument(): void {
    const f = FIXTURES[(fixtureCursor = (fixtureCursor + 1) % FIXTURES.length)];
    this.revision += 1;
    this.send({
      type: 'document.set',
      path: `~/Documents/${f.id}.md`,
      markdown: f.markdown,
      revision: this.revision,
      theme: this.theme,
    });
  }

  toggleTheme(): void {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    this.send({ type: 'theme.set', theme: this.theme });
  }

  save(): void {
    // RFC: 保存前主动拉取，不依赖最后一次变更事件
    this.send({ type: 'selection.get', id: 900 });
    setTimeout(() => this.send({ type: 'command', name: 'requestSave', id: 901 }), 30);
  }

  insertHostText(): void {
    this.send({
      type: 'command',
      name: 'insertMarkdown',
      id: 200,
      args: { markdown: `\n> 来自宿主的一行 · rev ${this.revision}\n` },
    });
  }

  async requestSelection(): Promise<unknown> {
    const p = new Promise((resolve) => (this.pendingSelectionGet = resolve));
    this.send({ type: 'selection.get', id: 300 });
    return p;
  }

  externalChange(): void {
    this.revision += 1;
    this.send({
      type: 'document.set',
      path: this.lastPath ?? '~/Documents/缪斯笔记.md',
      markdown: this.markdown + '\n\n<!-- 外部修改：mtime 变化后由 native 重新载入 -->\n',
      revision: this.revision,
      theme: this.theme,
    });
  }

  private push(dir: 'in' | 'out', msg: LogEntry['msg']): void {
    this.log.push({ dir, msg, t: performance.now() });
    if (this.log.length > 400) this.log.shift();
    const row = document.createElement('div');
    row.className = `sim-log__row sim-log__row--${dir}`;
    const label = document.createElement('span');
    label.className = 'sim-log__dir';
    label.textContent = dir === 'in' ? 'web →' : '← native';
    const body = document.createElement('code');
    body.textContent = JSON.stringify(msg, null, 0).slice(0, 220);
    row.append(label, body);
    this.ui.logEl.appendChild(row);
    this.ui.logEl.scrollTop = this.ui.logEl.scrollHeight;
  }

  renderState(): void {
    this.ui.stateEl.textContent =
      `rev ${this.revision} · 内存 ${this.markdown.length} 字 · 已保存 ${this.saves} 次` +
      (this.lastSaved ? ` · 最近保存 ${this.lastSaved.length} 字` : '');
  }
}
