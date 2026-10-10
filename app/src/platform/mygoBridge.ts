// MyGo 运行时桥：在 MyGo WebView 里用 Go 后端实现 window.muse API。
// 已有 window.muse 时跳过；纯浏览器（vite dev）下没有 window.mygo，同样跳过。
//
// 通道名即前端业务代码使用的 IPC 通道，业务侧零感知。
import { call, on as onGoEvent, onFileDrop, runtime as mygoRuntime, isMyGo } from 'mygo-runtime'

/** IPC 通道 -> Go 服务方法 映射表 */
const INVOKE_MAP: Record<string, string> = {
  'fs:open': 'Files.Open',
  'fs:openPath': 'Files.OpenPath',
  'fs:readFile': 'Files.ReadFile',
  'fs:watchFile': 'Files.WatchFile',
  'fs:unwatchFile': 'Files.UnwatchFile',
  'fs:isDir': 'Files.IsDir',
  'fs:save': 'Files.Save',
  'fs:saveAs': 'Files.SaveAs',
  'fs:createDefault': 'Files.CreateDefault',
  'fs:readRecent': 'Files.ReadRecent',
  'fs:pickFolder': 'Files.PickFolder',
  'fs:listTree': 'Files.ListTree',
  'fs:createFile': 'Files.CreateFile',
  'fs:createFolder': 'Files.CreateFolder',
  'fs:rename': 'Files.Rename',
  'fs:trash': 'Files.Trash',
  'fs:revealInFolder': 'Files.RevealInFolder',
  'fs:unwatchWorkspace': 'Files.UnwatchWorkspace',
  'fs:readDraft': 'Files.ReadDraft',
  'fs:writeDraft': 'Files.WriteDraft',
  'fs:clearDraft': 'Files.ClearDraft',
  'fs:saveImage': 'Export.SaveImage',
  'fs:pickAndSaveImage': 'Export.PickAndSaveImage',
  'app:export-pdf': 'Export.ExportPDF',
  'app:export-html': 'Export.ExportHTML',
  'app:get-open-paths': 'App.GetOpenPaths',
  'app:set-dirty': 'App.SetDirty',
  'app:close': 'App.Close',
  'dialog:confirm-unsaved': 'App.ConfirmUnsaved',
  'ai:test-connection': 'AI.TestConnection',
  'ai:chat-stream': 'AI.ChatStream',
  'ai:chat-abort': 'AI.ChatAbort',
  'ai:web-search': 'AI.WebSearch',
}

// 拖拽路径暂存：系统 WebView 的页面 drop 事件只有 File 对象（无路径），
// 但 MyGo 原生层会把同一次拖放的绝对路径经 onFileDrop 推过来，按文件名匹配回填。
let droppedPaths: string[] = []

/** 网页级剪贴板（右键菜单用）：WKWebView 无 webContents.cut/copy/paste 等价物，
 *  cut/copy/selectAll 走 execCommand；paste 受平台限制，改由 Go 读剪贴板后 insertText。 */
async function webCtx(op: string): Promise<void> {
  if (op === 'paste') {
    const text = await call<string>('Export.ReadClipboard')
    if (text) document.execCommand('insertText', false, text)
    return
  }
  document.execCommand(op)
}

/** 在 MyGo 环境下安装 window.muse；其他环境（纯浏览器）直接返回 false。 */
export function installMygoBridge(): boolean {
  if (typeof window === 'undefined' || window.muse) return false
  if (!isMyGo()) return false

  onFileDrop(({ paths }) => {
    droppedPaths = paths
  })

  const rt = mygoRuntime()
  window.muse = {
    version: `mygo ${rt.version ?? ''}`.trim(),
    platform: rt.platform,
    invoke: (channel: string, ...args: unknown[]) => {
      if (channel === 'app:webctx') return webCtx(args[0] as string)
      const method = INVOKE_MAP[channel]
      if (!method) return Promise.reject(new Error(`native: 未映射的通道 ${channel}`))
      return call(method, ...args) as Promise<unknown>
    },
    send: (channel: string, ...args: unknown[]) => {
      const method = INVOKE_MAP[channel]
      if (method) void call(method, ...args).catch(() => {})
    },
    getPathForFile: (file: File) => {
      return droppedPaths.find((p) => p === file.name || p.endsWith(`/${file.name}`)) ?? ''
    },
    on: (channel: string, cb: (...args: unknown[]) => void) => onGoEvent(channel, cb),
  }
  return true
}

// 自安装副作用：本模块必须作为入口的第一个 import（见 main.ts）——
// 业务模块在顶层就有 window.muse?.on(...) 订阅（如 useFile.ts 的
// fs:document-changed），模块求值顺序若晚于它们，这些监听会永久丢失。
installMygoBridge()
