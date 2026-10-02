/**
 * Muse · MyGo 版 e2e 冒烟测试。
 *
 * 构建单二进制 → 以 MUSE_E2E=1 启动（用户数据指向临时目录）→ 收集注入页面的
 * 断言结果（见 muse-go/e2e/assertions.js）→ 打印清单并以 0/1 退出。
 *
 * 用法（仓库根目录）：
 *   pnpm test:e2e              # 先 pnpm build:go，再跑
 *   node scripts/e2e-muse.mjs --no-build
 *
 * 注意：需要图形界面（会短暂弹出 Muse 窗口），不适合无头 CI。
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bin = join(root, 'muse-go', process.platform === 'win32' ? 'Muse.exe' : 'Muse')
const noBuild = process.argv.includes('--no-build')
const TIMEOUT_MS = 180_000

/** 运行命令并透传输出，返回退出码 */
function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32' })
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

if (!noBuild) {
  console.log('[e2e] pnpm build:go …')
  const code = await run('pnpm', ['build:go'])
  if (code !== 0) {
    console.error('[e2e] 构建失败')
    process.exit(1)
  }
}
if (!existsSync(bin)) {
  console.error(`[e2e] 找不到 ${bin}，先执行 pnpm build:go（或去掉 --no-build）`)
  process.exit(1)
}

console.log(`[e2e] 启动 ${bin}（会短暂弹出窗口）…`)
const child = spawn(bin, [], {
  cwd: root,
  env: { ...process.env, MUSE_E2E: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
})

let stdout = ''
child.stdout.on('data', (d) => {
  stdout += d
  process.stdout.write(d)
})
child.stderr.on('data', (d) => process.stderr.write(d))

const timer = setTimeout(() => {
  console.error(`\n[e2e] 超过 ${TIMEOUT_MS / 1000}s 未出结果，杀掉进程`)
  child.kill('SIGKILL')
}, TIMEOUT_MS)
const exitCode = await new Promise((resolve) => child.on('exit', resolve))
clearTimeout(timer)

const match = stdout.match(/^E2E_RESULT (.*)$/m)
if (!match) {
  console.error(`[e2e] 未收到 E2E_RESULT（进程退出码 ${exitCode}）`)
  process.exit(1)
}

let payload
try {
  payload = JSON.parse(match[1])
} catch (err) {
  console.error(`[e2e] E2E_RESULT 解析失败: ${err.message}`)
  process.exit(1)
}

const { ok, results = {}, error } = payload
if (error) console.error(`[e2e] 脚本异常:\n${error}`)

// ---- 打印断言清单 ----
const SKIP = new Set(['ok', 'runtimeErrors', 'bridge'])
let pass = 0
let fail = 0
for (const [name, value] of Object.entries(results)) {
  if (SKIP.has(name) || typeof value !== 'boolean') continue
  const good = value === true
  good ? pass++ : fail++
  console.log(`  ${good ? '✓' : '✗'} ${name}${good ? '' : `  → ${JSON.stringify(value)}`}`)
}
if (results.bridge) {
  for (const [name, value] of Object.entries(results.bridge)) {
    const good = value === true
    good ? pass++ : fail++
    console.log(`  ${good ? '✓' : '✗'} bridge.${name}${good ? '' : `  → ${JSON.stringify(value)}`}`)
  }
}
const runtimeErrors = results.runtimeErrors ?? []
if (runtimeErrors.length) {
  console.log(`  ✗ runtimeErrors → ${JSON.stringify(runtimeErrors)}`)
}

console.log(`\n[e2e] ${pass} 通过 / ${fail} 失败${ok ? ' —— 全绿' : ''}`)
process.exit(ok ? 0 : 1)
