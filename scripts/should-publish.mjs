/**
 * Decide se emitfy (PyPI) deve publicar.

 * exit 0 = publish, 10 = skip, 1 = erro (mu
dou sem bump)
 */
import { createHash } from 
'node:crypto'
import {
  existsSync,
  mkdtem
pSync,
  readFileSync,
  readdirSync,
  rmSyn
c,
  statSync,
  writeFileSync
} from 'node:f
s'
import { tmpdir } from 'node:os'
import { 
dirname, join, relative } from 'node:path'
im
port { fileURLToPath } from 'node:url'
import
 { execSync } from 'node:child_process'

cons
t root = join(dirname(fileURLToPath(import.me
ta.url)), '..')
const packageName = 'emitfy'

const userAgent = 'EmitfySDKPublish (mailto=d
ev@emitfy.com)'

function walkFiles(dir, file
s = []) {
  for (const name of readdirSync(di
r)) {
    const path = join(dir, name)
    if
 (statSync(path).isDirectory()) {
      walkF
iles(path, files)
    } else {
      files.pu
sh(path)
    }
  }
  return files
}

function
 sortKeys(value) {
  if (Array.isArray(value)
) {
    return value.map(sortKeys)
  }
  if (
value && typeof value === 'object') {
    con
st sorted = {}
    for (const key of Object.k
eys(value).sort()) {
      sorted[key] = sort
Keys(value[key])
    }
    return sorted
  }

  return value
}

function readLocalVersion()
 {
  const text = readFileSync(join(root, 'py
project.toml'), 'utf8')
  const match = text.
match(/^version\s*=\s*"([^"]+)"/m)
  if (!mat
ch) {
    throw new Error('version missing in
 pyproject.toml')
  }
  return match[1]
}

fu
nction contentHash(base) {
  const hash = cre
ateHash('sha256')
  const pyproject = join(ba
se, 'pyproject.toml')
  if (existsSync(pyproj
ect)) {
    const text = readFileSync(pyproje
ct, 'utf8').replaceAll('\r\n', '\n')
    cons
t withoutVersion = text.replace(/^version\s*=
\s*"[^"]+"/m, 'version = "0.0.0"')
    hash.u
pdate('pyproject.toml\0')
    hash.update(wit
houtVersion)
    hash.update('\0')
  }

  con
st pkgDir = join(base, 'emitfy')
  if (!exist
sSync(pkgDir)) {
    throw new Error(`emitfy/
 missing in ${base}`)
  }

  const files = wa
lkFiles(pkgDir).sort((a, b) =>
    relative(b
ase, a).localeCompare(relative(base, b))
  )

  for (const file of files) {
    const rel =
 relative(base, file).replaceAll('\\', '/')
 
   hash.update(rel)
    hash.update('\0')
   
 hash.update(readFileSync(file, 'utf8').repla
ceAll('\r\n', '\n'))
    hash.update('\0')
  
}
  return hash.digest('hex')
}

async functi
on fetchPypi() {
  const response = await fet
ch(`https://pypi.org/pypi/${packageName}/json
`, {
    headers: { 'User-Agent': userAgent }

  })
  if (response.status === 404) {
    re
turn null
  }
  if (!response.ok) {
    throw
 new Error(`PyPI HTTP ${response.status}`)
  
}
  return response.json()
}

const version =
 readLocalVersion()
const localHash = content
Hash(root)
const remote = await fetchPypi()


if (!remote) {
  console.log(`no remote packa
ge — publish ${packageName}==${version}`)
 
 process.exit(0)
}

const remoteVersion = rem
ote.info.version
const urls = remote.releases
?.[remoteVersion] || remote.urls || []
const 
sdist = urls.find((u) => u.packagetype === 's
dist') || urls.find((u) => String(u.filename)
.endsWith('.tar.gz'))

if (!sdist?.url) {
  t
hrow new Error(`no sdist for ${packageName}==
${remoteVersion}`)
}

const work = mkdtempSyn
c(join(tmpdir(), 'emitfy-py-cmp-'))
try {
  c
onst buffer = Buffer.from(
    await (
      
await fetch(sdist.url, { headers: { 'User-Age
nt': userAgent }, redirect: 'follow' })
    )
.arrayBuffer()
  )
  const archive = join(wor
k, 'pkg.tar.gz')
  writeFileSync(archive, buf
fer)
  execSync(`tar -xzf "${archive}" -C "${
work}"`, { stdio: 'pipe' })
  const folder = 
readdirSync(work).find(
    (name) => name !=
= 'pkg.tar.gz' && statSync(join(work, name)).
isDirectory()
  )
  const remoteHash = conten
tHash(join(work, folder))

  if (localHash ==
= remoteHash) {
    console.log(
      `SDK u
nchanged vs ${packageName}==${remoteVersion} 
— skip (${localHash.slice(0, 12)})`
    )
 
   process.exit(10)
  }

  if (remote.release
s?.[version]) {
    console.error(
      `SDK
 changed, but ${packageName}==${version} alre
ady on PyPI. Bump version in pyproject.toml.`

    )
    process.exit(1)
  }

  console.log
(
    `SDK changed (${localHash.slice(0, 8)} 
≠ ${remoteHash.slice(0, 8)}) — publish ${
version}`
  )
  process.exit(0)
} finally {
 
 rmSync(work, { recursive: true, force: true 
})
}


