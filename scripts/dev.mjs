// 一键开发：并行启动 vite dev server（前端 HMR）与 go run（MyGo 窗口加载 devUrl）。
// 任一侧退出即整体收尾；Ctrl-C 会同时结束两个子进程。
import { spawn } from 'node:child_process'

const children = []

/** @param {string} script package.json 里的脚本名 */
function run(script) {
  const child = spawn('pnpm', ['run', script], {
    stdio: 'inherit',
    // Windows 下 pnpm 是 .cmd，需要 shell 才能解析
    shell: process.platform === 'win32'
  })
  children.push(child)
  return child
}

let closing = false
function shutdown(code = 0) {
  if (closing) return
  closing = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

const vite = run('dev:web')
const go = run('dev:go')
for (const child of [vite, go]) {
  child.on('exit', (code) => shutdown(code ?? 1))
  child.on('error', (err) => {
    console.error('[dev] 子进程启动失败：', err.message)
    shutdown(1)
  })
}
