/**
 * 打包 agent-test-entry.ts 并在 Node 中运行（无需 Electron / 浏览器）。
 * 用法：node scripts/test-agent.mjs
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const esbuild = require('esbuild')

const dir = mkdtempSync(join(tmpdir(), 'muse-agent-test-'))
const out = join(dir, 'bundle.cjs')

await esbuild.build({
  entryPoints: ['scripts/agent-test-entry.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: out,
  logLevel: 'silent',
})

writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'commonjs' }))
// 需要 package.json type=commonjs，bundle.cjs 在 commonjs 目录下运行
const result = await import(pathToFileURL(out).href + '?t=' + Date.now())
void result
