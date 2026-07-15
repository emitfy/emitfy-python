/**
 * Decide se emitfy (PyPI) deve publicar.
 * exit 0 = publish, 10 = skip, 1 = erro (mudou sem bump)
 */
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageName = 'emitfy'
const userAgent = 'EmitfySDKPublish (mailto=dev@emitfy.com)'

function walkFiles(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      walkFiles(path, files)
    } else {
      files.push(path)
    }
  }
  return files
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys)
  }
  if (value && typeof value === 'object') {
    const sorted = {}
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortKeys(value[key])
    }
    return sorted
  }
  return value
}

function readLocalVersion() {
  const text = readFileSync(join(root, 'pyproject.toml'), 'utf8')
  const match = text.match(/^version\s*=\s*"([^"]+)"/m)
  if (!match) {
    throw new Error('version missing in pyproject.toml')
  }
  return match[1]
}

function contentHash(base) {
  const hash = createHash('sha256')
  const pyproject = join(base, 'pyproject.toml')
  const readmePath = join(base, 'README.md')

  if (existsSync(pyproject)) {
    const text = readFileSync(pyproject, 'utf8').replaceAll('\r\n', '\n')
    const withoutVersion = text.replace(/^version\s*=\s*"[^"]+"/m, 'version = "0.0.0"')
    hash.update('pyproject.toml\0')
    hash.update(withoutVersion)
    hash.update('\0')
  }

  if (existsSync(readmePath)) {
    hash.update('README.md\0')
    hash.update(readFileSync(readmePath, 'utf8').replaceAll('\r\n', '\n'))
    hash.update('\0')
  }

  const pkgDir = join(base, 'emitfy')
  if (!existsSync(pkgDir)) {
    throw new Error(`emitfy/ missing in ${base}`)
  }

  const files = walkFiles(pkgDir).sort((a, b) =>
    relative(base, a).localeCompare(relative(base, b))
  )
  for (const file of files) {
    const rel = relative(base, file).replaceAll('\\', '/')
    hash.update(rel)
    hash.update('\0')
    hash.update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n'))
    hash.update('\0')
  }
  return hash.digest('hex')
}

async function fetchPypi() {
  const response = await fetch(`https://pypi.org/pypi/${packageName}/json`, {
    headers: { 'User-Agent': userAgent }
  })
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error(`PyPI HTTP ${response.status}`)
  }
  return response.json()
}

const version = readLocalVersion()
const localHash = contentHash(root)
const remote = await fetchPypi()

if (!remote) {
  console.log(`no remote package — publish ${packageName}==${version}`)
  process.exit(0)
}

const remoteVersion = remote.info.version
const urls = remote.releases?.[remoteVersion] || remote.urls || []
const sdist = urls.find((u) => u.packagetype === 'sdist') || urls.find((u) => String(u.filename).endsWith('.tar.gz'))

if (!sdist?.url) {
  throw new Error(`no sdist for ${packageName}==${remoteVersion}`)
}

const work = mkdtempSync(join(tmpdir(), 'emitfy-py-cmp-'))
try {
  const buffer = Buffer.from(
    await (
      await fetch(sdist.url, { headers: { 'User-Agent': userAgent }, redirect: 'follow' })
    ).arrayBuffer()
  )
  const archive = join(work, 'pkg.tar.gz')
  writeFileSync(archive, buffer)
  execSync(`tar -xzf "${archive}" -C "${work}"`, { stdio: 'pipe' })
  const folder = readdirSync(work).find(
    (name) => name !== 'pkg.tar.gz' && statSync(join(work, name)).isDirectory()
  )
  const remoteHash = contentHash(join(work, folder))

  if (localHash === remoteHash) {
    console.log(
      `SDK unchanged vs ${packageName}==${remoteVersion} — skip (${localHash.slice(0, 12)})`
    )
    process.exit(10)
  }

  if (remote.releases?.[version]) {
    console.error(
      `SDK changed, but ${packageName}==${version} already on PyPI. Bump version in pyproject.toml.`
    )
    process.exit(1)
  }

  console.log(
    `SDK changed (${localHash.slice(0, 8)} ≠ ${remoteHash.slice(0, 8)}) — publish ${version}`
  )
  process.exit(0)
} finally {
  rmSync(work, { recursive: true, force: true })
}
