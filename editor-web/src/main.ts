/**
 * PoC shell — mounts one canvas (vditor | milkdown via ?editor=), wires the
 * RFC-001 §5.2 bridge, and (with ?harness=1) the native-host simulator.
 */
import './shell.css';
import { WebBridge } from './bridge/webBridge';
import { NativeSim } from './bridge/nativeSim';
import { applyTokens } from './theme/tokens';
import type { CanvasEditor } from './canvasApi';
import { FIXTURES } from './fixtures';
import type { NativeToWeb, ThemeName } from './bridge/protocol';

const params = new URLSearchParams(location.search);
const editorName = params.get('editor') === 'vditor' ? 'vditor' : 'milkdown';
const harness = params.get('harness') === '1';

const canvasEl = document.getElementById('canvas')!;
const statusEl = document.getElementById('statusbar')!;
const simLogEl = document.getElementById('simLog') as HTMLElement | null;
const simStateEl = document.getElementById('simState') as HTMLElement | null;
const simBtnsEl = document.getElementById('simActions') as HTMLElement | null;

let editor: CanvasEditor;
let bridge: WebBridge;
let sim: NativeSim | null = null;
let currentTheme: ThemeName = 'dark';

function setStatus(): void {
  const sel = editor.getSelection();
  statusEl.textContent =
    `${editor.name} ${editor.version} · rev ${bridge.currentRevision} · ` +
    `${editor.getMarkdown().length} 字 · 选区 ${sel.from}–${sel.to}` +
    (sim ? ` · 模拟保存 ${sim.saves} 次` : '');
}

async function loadEditorModule(): Promise<CanvasEditor> {
  const mod = editorName === 'vditor' ? await import('./vditor/main') : await import('./milkdown/main');
  return mod.create(canvasEl);
}

function wireEditor(ed: CanvasEditor): void {
  ed.onContentChanged(() => {
    bridge.contentChanged(ed.getMarkdown());
    setStatus();
  });
  ed.onSelectionChanged(() => {
    bridge.selectionChanged(ed.getSelection());
    setStatus();
  });
  ed.onLinkOpen((href) => bridge.linkOpen(href));
  ed.onImagePaste((mime, b64) => bridge.imagePaste(mime, b64));
}

function runCommand(name: string, args: Record<string, unknown>): boolean {
  if (name === 'requestSave') {
    bridge.requestSave();
    return true;
  }
  return editor.runCommand(name, args);
}

async function boot(): Promise<void> {
  document.getElementById('brandEditor')!.textContent = `${editorName} · RFC-001 M${editorName === 'vditor' ? '0' : '0.5'} PoC`;
  document.querySelectorAll<HTMLAnchorElement>('.shell-nav a').forEach((a) => {
    const ed = a.dataset.ed;
    if (ed === editorName && a.dataset.st === undefined) a.classList.add('is-current');
  });
  if (harness) {
    const panel = document.getElementById('simPanel')!;
    panel.hidden = false;
  }
  applyTokens(currentTheme);

  editor = await loadEditorModule();
  wireEditor(editor);
  // browser-driven QA probe (self-test bench and host debugging only)
  (window as unknown as { __canvas: CanvasEditor }).__canvas = editor;

  bridge = new WebBridge({
    editorName: editor.name,
    editorVersion: editor.version,
    getMarkdown: () => editor.getMarkdown(),
    runCommand,
    setDocument: (md) => editor.setMarkdown(md),
    setTheme: (theme, tokens) => {
      currentTheme = theme;
      applyTokens(theme, tokens);
      editor.setTheme(theme);
    },
    getSelection: () => editor.getSelection(),
    onTrace: (dir, msg) => {
      if (!harness || !sim) return;
      void dir;
      void msg; // sim renders its own log from deliver()/send()
    },
  });

  if (harness && simLogEl && simStateEl && simBtnsEl) {
    sim = new NativeSim({ logEl: simLogEl, stateEl: simStateEl });
    window.addEventListener('muse:inbox', (e) => {
      const msg = (e as CustomEvent<{ msg: NativeToWeb }>).detail.msg;
      // native → web transport: mirror of WKScriptMessageHandler
      bridge.receive(msg);
    });
    buildSimButtons();
  }

  bridge.start();
  applyTokens(currentTheme);
  editor.setTheme(currentTheme);
  bridge.on((msg) => {
    if (msg.type === 'document.set') {
      document.getElementById('chromeTitle')!.textContent = msg.path;
    }
  });
  setStatus();
  setInterval(setStatus, 1200);

  if (params.get('selftest') === '1') {
    await sleep(400);
    await runRoundTrip();
  }
}

function buildSimButtons(): void {
  const actions: Array<[string, () => void]> = [
    ['换文档', () => sim!.reloadDocument()],
    ['切主题', () => sim!.toggleTheme()],
    ['模拟保存', () => sim!.save()],
    ['宿主插入', () => sim!.insertHostText()],
    ['读选区', () => void sim!.requestSelection()],
    ['外部修改', () => sim!.externalChange()],
    ['自测往返', () => void runRoundTrip()],
  ];
  for (const [label, fn] of actions) {
    const b = document.createElement('button');
    b.className = 'sim-btn';
    b.textContent = label;
    b.addEventListener('click', fn);
    simBtnsEl!.appendChild(b);
  }
}

/* ---- round-trip self test (RFC §7 数据) ---- */

interface Row {
  id: string;
  name: string;
  pass: boolean;
  note: string;
}

async function runRoundTrip(): Promise<void> {
  const rows: Row[] = [];
  for (const f of FIXTURES) {
    editor.setMarkdown(f.markdown);
    await sleep(60);
    const first = editor.getMarkdown();
    await sleep(30);
    editor.setMarkdown(first);
    await sleep(60);
    const second = editor.getMarkdown();

    const norm = (s: string) => s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    const a = norm(first);
    const b = norm(second);
    const idempotent = a === b;
    const failed = f.checks.filter((c) => !c.re.test(a));
    rows.push({
      id: f.id,
      name: f.name,
      pass: idempotent && failed.length === 0,
      note: failed.length
        ? `语义丢失: ${failed.map((x) => x.desc).join('、')}`
        : idempotent
          ? '往返稳定'
          : '两次导出不一致（规范化未收敛）',
    });
  }
  const table = document.createElement('div');
  table.className = 'rt-table';
  table.innerHTML =
    `<div class="rt-table__head">ROUND-TRIP ${editor.name} — ` +
    `${rows.filter((r) => r.pass).length}/${rows.length} PASS</div>` +
    rows
      .map(
        (r) =>
          `<div class="rt-row ${r.pass ? 'is-pass' : 'is-fail'}">` +
          `<code>${r.id}</code><span>${r.name}</span><em>${r.note}</em></div>`,
      )
      .join('');
  document.getElementById('selftest')!.replaceChildren(table);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

void boot();
