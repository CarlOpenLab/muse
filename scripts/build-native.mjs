import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const { version } = JSON.parse(readFileSync(`${root}package.json`, 'utf8'))
const publicKey = readFileSync(`${root}resources/update-public-key.txt`, 'utf8').trim()
const target = execFileSync('go', ['env', 'GOOS', 'GOARCH'], { cwd: `${root}native`, encoding: 'utf8' }).trim().split(/\s+/).join('-')
const output = process.argv[2] || (target.startsWith('windows-') ? 'Muse.exe' : 'Muse')
const flags = [
  '-s -w',
  '-X github.com/egoist/mygo.production=1',
  '-X github.com/egoist/mygo.packageName=Muse',
  `-X github.com/egoist/mygo.packageVersion=${version}`,
  '-X github.com/egoist/mygo.packageIdentifier=com.muse.app',
  `-X github.com/egoist/mygo.packageUpdateKey=${publicKey}`,
  `-X github.com/egoist/mygo.packageUpdateFeed=https://github.com/CarlOpenLab/muse/releases/latest/download/update-${target}.json`,
].join(' ')
execFileSync('go', ['build', `-ldflags=${flags}`, '-o', output, '.'], {
  cwd: `${root}native`, env: { ...process.env, CGO_ENABLED: '0' }, stdio: 'inherit',
})
