#!/usr/bin/env node
/**
 * 开发模式下给 node_modules 里的 Electron.app 补上文档类型声明 + 修正 Dock 名称。
 *
 * 为什么需要：
 * 1) macOS Dock 会根据 app 的 Info.plist 中 CFBundleDocumentTypes 决定是否接受拖放
 *    — 未声明时拖文件到 Dock 图标不会高亮，open-file 根本不会触发。
 * 2) Dock 悬停显示的名称取自 CFBundleDisplayName / CFBundleName，直接跑
 *    Electron.app 时默认是 "Electron"，即使用 app.setName('Muse') 也改不了 Dock tooltip，
 *    必须把 Electron.app 自身的 Info.plist 改掉。
 *
 * 打包后的 .app 由 electron-builder.yml 的 extendInfo 提供，无需本脚本。
 * 幂等：重复执行只会覆盖为正确值。
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

if (process.platform !== 'darwin') process.exit(0)

const require = createRequire(import.meta.url)
let electronBin = ''
try {
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

function setPlistString(key, value) {
  // 已存在则 Set，不存在则 Add；两种都尝试
  if (plistBuddy(`Print :${key}`)) {
    plistBuddy(`Set :${key} ${value}`)
  } else {
    plistBuddy(`Add :${key} string ${value}`)
  }
}

// ---- 1) 修正 Dock 悬停名称：Electron -> Muse ----
setPlistString('CFBundleName', 'Muse')
setPlistString('CFBundleDisplayName', 'Muse')

// 同步检查是否改成功
let okName = false
try {
  const out = execFileSync(PB, ['-c', 'Print :CFBundleDisplayName', plist], { encoding: 'utf8' })
  okName = out.trim() === 'Muse'
} catch {}
if (okName) console.log('[dock-types] 已修正 Electron.app 名称为 Muse')
else console.log('[dock-types] 修正名称失败，请检查权限')

// ---- 2) 声明 Markdown 文件 + 文件夹（幂等：已存在则跳过）----
if (!plistBuddy('Print :CFBundleDocumentTypes')) {
  const cmds = [
    'Add :CFBundleDocumentTypes array',
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
    'Add :CFBundleDocumentTypes:1 dict',
    'Add :CFBundleDocumentTypes:1:CFBundleTypeName string Folder',
    'Add :CFBundleDocumentTypes:1:CFBundleTypeRole string Viewer',
    'Add :CFBundleDocumentTypes:1:LSHandlerRank string Alternate',
    'Add :CFBundleDocumentTypes:1:LSItemContentTypes array',
    'Add :CFBundleDocumentTypes:1:LSItemContentTypes:0 string public.folder'
  ]
  for (const c of cmds) plistBuddy(c)
  console.log('[dock-types] 已为 Electron.app 声明 Markdown/Folder 类型')
} else {
  console.log('[dock-types] Electron.app 已声明文档类型，跳过')
}

// 重新注册 LaunchServices，Dock 才能立刻用上新名称/类型
const lsregister =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
try {
  execFileSync(lsregister, ['-f', appDir], { stdio: 'pipe' })
  // 触发 Dock 刷新（不会杀掉正在运行的 app，只刷新图标缓存）
  try { execFileSync('/usr/bin/killall', ['Dock'], { stdio: 'pipe' }) } catch {}
  console.log('[dock-types] 已重新注册 LaunchServices 并刷新 Dock')
} catch {
  console.log('[dock-types] lsregister 注册失败，请手动执行 killall Dock 后重开')
}
