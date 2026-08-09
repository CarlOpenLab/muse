/**
 * Agent 工具调用端到端测试：用 Electron 加载真实构建产物，
 * 驱动 UI 发送带工具意图的消息，验证 mock 工具流 → 编辑器真实修改。
 *
 * 用法：先 npm run build，再 node scripts/e2e-agent.mjs
 */
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electron = require('electron')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// 临时主进程脚本（CJS）
const mainScript = join(root, 'scripts', '.e2e-main.cjs')
const fs = await import('node:fs')
fs.writeFileSync(
  mainScript,
  `
const { app, BrowserWindow } = require('electron')
const path = require('path')

async function run() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    webPreferences: {
      preload: path.join(${JSON.stringify(root)}, 'out/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  await win.loadFile(path.join(${JSON.stringify(root)}, 'out/renderer/index.html'))
  // 等应用挂载 + 编辑器/聊天就绪
  await new Promise((r) => setTimeout(r, 4500))

  const result = await win.webContents.executeJavaScript(\`
    (async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const log = []

      // 1) 新建文档（Entry 欢迎页）
      const newBtn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('新建文件'))
      if (!newBtn) return { ok: false, log, err: '未找到新建按钮' }
      newBtn.click()
      await sleep(1500)

      // 2) 打开 AI 侧栏（左侧活动栏 Sparkles）
      const sparkles = document.querySelector('button[title="AI 对话"]')
      if (!sparkles) return { ok: false, log, err: '未找到 AI 活动栏按钮' }
      sparkles.click()
      await sleep(800)

      // 3) 在输入框输入工具意图消息并回车发送
      const ta = document.querySelector('.chat-panel textarea')
      if (!ta) return { ok: false, log, err: '未找到聊天输入框' }
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      setter.call(ta, '帮我在文末添加一段总结')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      await sleep(300)
      ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await sleep(300)
      ta.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true }))

      // 4) 等待 agent 流（mock 工具轮 + 文本轮）
      await sleep(9000)

      const pm = document.querySelector('.ProseMirror')
      const docText = pm ? pm.textContent : ''
      const inserted = docText.includes('由 Muse AI 演示添加')
      log.push('docText 含演示段落: ' + inserted)

      const bubbles = [...document.querySelectorAll('.chat-markdown')].map((e) => e.textContent || '')
      const replied = bubbles.some((t) => t.includes('工具调用') && t.includes('修改文档'))
      log.push('AI 回复提及工具调用: ' + replied)

      // 5) 思考链组件（ThoughtChain）渲染了工具节点
      const chainEl = document.querySelector('.chain-wrap .antd-thought-chain')
      const chainText = chainEl ? chainEl.textContent || '' : ''
      const chainShown = chainText.includes('追加到文末')
      log.push('ThoughtChain 渲染工具节点: ' + chainShown)

      return { ok: inserted && replied && chainShown, log, docText: docText.slice(0, 200) }
    })()
  \`, true)

  console.log('E2E_RESULT ' + JSON.stringify(result))
  app.exit(result && result.ok ? 0 : 1)
}

app.whenReady().then(run).catch((e) => {
  console.error('E2E_ERROR ' + e)
  app.exit(2)
})
`
)

try {
  const { spawn } = await import('node:child_process')
  const child = spawn(electron, [mainScript], { stdio: ['ignore', 'inherit', 'inherit'] })
  const exitCode = await new Promise((resolve) => child.on('exit', resolve))
  process.exit(exitCode ?? 1)
} finally {
  fs.rmSync(mainScript, { force: true })
}
