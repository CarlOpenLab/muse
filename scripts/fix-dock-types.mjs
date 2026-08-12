#!/usr/bin/env node
/**
 * 开发模式下给 node_modules 里的 Electron.app 补上文档类型声明。
 *
 * 为什么需要：macOS Dock 会根据 app 的 Info.plist 中 CFBundleDocumentTypes
 * 决定是否接受拖放——未声明任何类型时，拖文件/文件夹到 Dock 图标不会高亮，
 * drop 被直接丢弃，open-file 事件根本不会触发。dev 模式跑的是 Electron.app
 * （bundle 里没有任何文档类型声明），所以要在每次 dev 启动前补一次。
 * 打包后的 .app 由 electron-builder.yml 的 extendInfo 提供，无需本脚本。
 *
 * 幂等：已声明过就直接跳过。
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

if (process.platform !== 'darwin') process.exit(0)

const require = createRequire(import.meta.url)
let electronBin = ''
try {
  // electron 包导出的就是可执行文件路径
  electronBin = require('electron')
} catch {
  console.log('[dock-types] 未找到 electron 包，跳过')
  process.exit(0)
}

// electronBin 形如 …/dist/Electron.app/Contents/MacOS/Electron，向上找到 .app
let appDir = dirname(electronBin)
while (dirname(appDir) !== appDir && !appDir.endsWith('.app')) {
  appDir = dirname(appDir)
}
if (!appDir.endsWith('.app')) {
  console.log('[dock-types] 未找到 Electron.app，跳过')
  process.exit(0)
}

const plist = join(appDir, 'Contents', 'Info.plist')
const PB = '/usr/libexec/PlistBuddy'

function plistBuddy(cmd) {
  try {
    execFileSync(PB, ['-c', cmd, plist], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

// 幂等：已声明过就跳过
if (plistBuddy('Print :CFBundleDocumentTypes')) {
  console.log('[dock-types] Electron.app 已声明文档类型，跳过')
  process.exit(0)
}

// 声明 Markdown 文件 + 文件夹（文件夹用 UTI public.folder 表达）
const cmds = [
  'Add :CFBundleDocumentTypes array',
  // Markdown 文档
  'Add :CFBundleDocumentTypes:0 dict',
  'Add :CFBundleDocumentTypes:0:CFBundleTypeName string Markdown Document',
  'Add :CFBundleDocumentTypes:0:CFBundleTypeRole string Editor',
  'Add :CFBundleDocumentTypes:0:LSHandlerRank string Alternate',
  'Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions array',
  'Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:0 string md',
  'Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:1 string markdown',
  'Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:2 string mdx',
  'Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:3 string txt',
  'Add :CFBundleDocumentTypes:0:LSItemContentTypes array',
  'Add :CFBundleDocumentTypes:0:LSItemContentTypes:0 string net.daringfireball.markdown',
  'Add :CFBundleDocumentTypes:0:LSItemContentTypes:1 string public.plain-text',
  'Add :CFBundleDocumentTypes:0:LSItemContentTypes:2 string public.text',
  // 文件夹（工作区）
  'Add :CFBundleDocumentTypes:1 dict',
  'Add :CFBundleDocumentTypes:1:CFBundleTypeName string Folder',
  'Add :CFBundleDocumentTypes:1:CFBundleTypeRole string Viewer',
  'Add :CFBundleDocumentTypes:1:LSHandlerRank string Alternate',
  'Add :CFBundleDocumentTypes:1:LSItemContentTypes array',
  'Add :CFBundleDocumentTypes:1:LSItemContentTypes:0 string public.folder'
]
for (const c of cmds) plistBuddy(c)

// 重新注册 LaunchServices，Dock 才能立刻用上新声明
const lsregister =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
try {
  execFileSync(lsregister, ['-f', appDir], { stdio: 'pipe' })
  console.log('[dock-types] 已为 Electron.app 声明 Markdown/Folder 类型并重新注册，Dock 拖放已可用')
} catch {
  console.log('[dock-types] lsregister 注册失败，请重启应用后再试')
}
