/**
 * RFC-001 §5.2 — Bridge protocol between the native (Go/MyGo) host and the
 * web canvas. This module is transport-agnostic: messages are plain JSON
 * objects; `webBridge.ts` carries them over WKScriptMessageHandler (real
 * host) or an in-page harness (browser-only PoC).
 */

export type ThemeName = 'light' | 'dark';

/** Native → Web */
export interface DocumentSetMsg {
  type: 'document.set';
  path: string;
  markdown: string;
  revision: number;
  theme: ThemeName;
}
export interface ThemeSetMsg {
  type: 'theme.set';
  theme: ThemeName;
  tokens?: Record<string, string>;
}
export interface CommandMsg {
  type: 'command';
  name:
    | 'focus'
    | 'blur'
    | 'undo'
    | 'redo'
    | 'selectAll'
    | 'insertMarkdown'
    | 'replaceSelection'
    /** native asks the canvas to emit document.saveRequested with fresh markdown */
    | 'requestSave';
  id?: number;
  args?: Record<string, unknown>;
}
export interface SelectionGetMsg {
  type: 'selection.get';
  id: number;
}

export type NativeToWeb = DocumentSetMsg | ThemeSetMsg | CommandMsg | SelectionGetMsg;

/** Web → Native */
export interface ReadyMsg {
  type: 'ready';
  editor: 'vditor' | 'milkdown';
  version: string;
}
export interface DocumentChangedMsg {
  type: 'document.changed';
  markdown: string;
  revision: number;
}
export interface DocumentSaveRequestedMsg {
  type: 'document.saveRequested';
  markdown: string;
}
export interface SelectionChangedMsg {
  type: 'selection.changed';
  from: number;
  to: number;
  text: string;
}
export interface LinkOpenMsg {
  type: 'link.open';
  href: string;
}
export interface ImagePasteMsg {
  type: 'image.paste';
  mime: string;
  base64: string;
}
/** Reply to a native request (selection.get / command with id). */
export interface SelectionReplyMsg extends SelectionChangedMsg {
  id: number;
  replyTo: 'selection.get';
}
export interface CommandReplyMsg {
  type: 'command.reply';
  id: number;
  ok: boolean;
  error?: string;
}

export type WebToNative =
  | ReadyMsg
  | DocumentChangedMsg
  | DocumentSaveRequestedMsg
  | SelectionChangedMsg
  | SelectionReplyMsg
  | LinkOpenMsg
  | ImagePasteMsg
  | CommandReplyMsg;

export type AnyBridgeMsg = NativeToWeb | WebToNative;

/** RFC §5.2: `document.changed` is debounced 150–250ms. */
export const DOCUMENT_CHANGED_DEBOUNCE_MS = 200;

export function isNativeToWeb(m: AnyBridgeMsg): m is NativeToWeb {
  const types: NativeToWeb['type'][] = ['document.set', 'theme.set', 'command', 'selection.get'];
  return types.includes((m as NativeToWeb).type);
}
