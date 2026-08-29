/**
 * 图片粘贴 / 拖拽落盘：把剪贴板或拖入的图片复制到「文档同目录 assets/」下，
 * 并以相对路径插入（Typora 行为）。无落盘路径时退化为 data URL 内嵌。
 * ⌘⌃I / 菜单「插入图片」走 fs:pickAndSaveImage（主进程选文件 + 拷贝），
 * 由 App.vue 通过 insert-image 动作插入，不经过本插件。
 */
import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import type { EditorView } from '@milkdown/prose/view'
import { useFile } from '../composables/useFile'

export const imagePasteKey = new PluginKey('muse-image-paste')

/** Uint8Array → base64（分块避免 String.fromCharCode 爆栈） */
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** 把图片文件存到文档 assets/（或退化 data URL），返回可用的 src */
async function saveImage(file: File): Promise<string | null> {
  try {
    const base64 = toBase64(new Uint8Array(await file.arrayBuffer()))
    const docPath = useFile().currentPath.value
    if (docPath) {
      const rel = (await window.muse?.invoke('fs:saveImage', docPath, file.name || 'image.png', base64)) as
        | string
        | null
      if (typeof rel === 'string' && rel) return rel
    }
    return `data:${file.type || 'image/png'};base64,${base64}`
  } catch {
    return null
  }
}

async function insertImageAt(view: EditorView, pos: number, file: File): Promise<void> {
  const src = await saveImage(file)
  if (!src) return
  const { state } = view
  const image = state.schema.nodes.image
  if (!image) return
  const alt = file.name.replace(/\.[a-z0-9]+$/i, '')
  const node = image.create({ src, alt })
  view.dispatch(state.tr.insert(pos, node).scrollIntoView())
  view.focus()
}

function isImageFile(f: File): boolean {
  return f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(f.name)
}

export const imagePastePlugin = $prose(
  () =>
    new Plugin({
      key: imagePasteKey,
      props: {
        handlePaste(view: EditorView, event: ClipboardEvent): boolean {
          const files = Array.from(event.clipboardData?.files ?? []).filter(isImageFile)
          if (!files.length) return false
          event.preventDefault()
          const pos = view.state.selection.from
          void (async () => {
            for (const f of files) await insertImageAt(view, pos, f)
          })()
          return true
        },
        handleDOMEvents: {
          drop(view: EditorView, event: DragEvent): boolean {
            const files = Array.from(event.dataTransfer?.files ?? []).filter(isImageFile)
            if (!files.length) return false
            event.preventDefault()
            event.stopPropagation() // 别让窗口级「打开 markdown」处理器接管
            const coords = { left: event.clientX, top: event.clientY }
            const pos = view.posAtCoords(coords)?.pos ?? view.state.selection.from
            void (async () => {
              for (const f of files) await insertImageAt(view, pos, f)
            })()
            return true
          },
        },
      },
    })
)
