/// <reference types="vite/client" />
/// <reference types="unocss/vite-client" />

interface Window {
  muse?: {
    version: string
    platform: string
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    getPathForFile: (file: File) => string
    on: (channel: string, cb: (...args: unknown[]) => void) => () => void
  }
}
