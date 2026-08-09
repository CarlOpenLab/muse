import { contextBridge, ipcRenderer, webUtils } from 'electron'

// 受控的 IPC 桥：渲染进程只通过 window.muse 访问能力
const api = {
  version: process.versions.electron,
  platform: process.platform,
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  send: (channel: string, ...args: unknown[]) => ipcRenderer.send(channel, ...args),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    const listener = (_e: unknown, ...args: unknown[]): void => cb(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('muse', api)

export type MuseApi = typeof api
