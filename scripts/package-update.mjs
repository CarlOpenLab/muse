import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const { version } = JSON.parse(readFileSync(`${root}package.json`, 'utf8'))
const [source, entry, target] = process.argv.slice(2)
if (!source || !entry || !/^(darwin|windows|linux)-(arm64|amd64)$/.test(target ?? '')) {
  throw new Error('Usage: node scripts/package-update.mjs <source directory> <entry> <os-arch>')
}
const rawKey = Buffer.from((process.env.MYGO_UPDATER_PRIVATE_KEY ?? '').trim(), 'base64')
if (rawKey.length !== 64) throw new Error('MYGO_UPDATER_PRIVATE_KEY must contain the Ed25519 signing key')
const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), rawKey.subarray(0, 32)]), format: 'der', type: 'pkcs8' })
const publicKey = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).subarray(-32)
if (publicKey.toString('base64') !== readFileSync(`${root}resources/update-public-key.txt`, 'utf8').trim()) {
  throw new Error('Signing key does not match the public key built into Muse')
}
mkdirSync(`${root}dist`, { recursive: true })
const name = `Muse-${version}-${target}.tar.gz`
const archive = `${root}dist/${name}`
execFileSync('tar', ['-czf', archive, '-C', source, entry], { stdio: 'inherit', env: { ...process.env, COPYFILE_DISABLE: '1' } })
const digest = createHash('sha256').update(readFileSync(archive)).digest()
const signature = sign(null, digest, privateKey)
if (!verify(null, digest, createPublicKey(privateKey), signature)) throw new Error('Signature verification failed')
const changelog = readFileSync(`${root}CHANGELOG.md`, 'utf8')
const section = changelog.split(`## ${version}\n`)[1]?.split('\n## ')[0]?.trim()
if (!section) throw new Error(`CHANGELOG.md has no notes for ${version}`)
writeFileSync(`${root}dist/update-${target}.json`, JSON.stringify({
  version, notes: section, date: new Date().toISOString(),
  url: `https://github.com/CarlOpenLab/muse/releases/download/v${version}/${name}`,
  size: statSync(archive).size, signature: signature.toString('base64'),
}, null, 2) + '\n')
console.log(`Signed and verified ${name}`)
