import fs from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'
import { parseMetadata, UserscriptParseError } from './metadata'
import { matchesUrl } from './matcher'
import { fetchAsset, fetchText } from './fetch'

// On-disk layout, rooted at <userData>/userscripts:
//
//   index.json                     installed scripts + their parsed metadata
//   <id>/script.user.js            the script itself
//   <id>/values.json               GM_setValue storage
//   <id>/requires/<hash>.js        cached @require
//   <id>/resources/<hash>          cached @resource

type Index = { version: 1; scripts: UserscriptEntry[] }

/** Resource payloads are inlined as data URLs, so keep a lid on the size. */
const MAX_RESOURCE_BYTES = 8 * 1024 * 1024

let rootDir = ''
let index: Index = { version: 1, scripts: [] }

/** Injection payloads are rebuilt from disk only when something changes. */
const payloadCache = new Map<string, UserscriptPayload>()
const valueCache = new Map<string, Record<string, string>>()

const indexPath = () => join(rootDir, 'index.json')
const scriptDir = (id: string) => join(rootDir, id)
const scriptPath = (id: string) => join(scriptDir(id), 'script.user.js')
const valuesPath = (id: string) => join(scriptDir(id), 'values.json')
const assetPath = (id: string, kind: 'requires' | 'resources', url: string) =>
  join(scriptDir(id), kind, hash(url) + (kind === 'requires' ? '.js' : ''))

function hash(value: string) {
  return createHash('sha1').update(value).digest('hex').slice(0, 16)
}

function scriptId(meta: UserscriptMeta) {
  return hash(`${meta.namespace}\n${meta.name}`)
}

function readIndex(): Index {
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath(), 'utf8'))
    if (parsed && Array.isArray(parsed.scripts)) return { version: 1, scripts: parsed.scripts }
  } catch {
    // No index yet, or it got corrupted — start from an empty list rather than
    // taking the whole app down.
  }
  return { version: 1, scripts: [] }
}

function writeIndex() {
  fs.mkdirSync(rootDir, { recursive: true })
  fs.writeFileSync(indexPath(), JSON.stringify(index, null, 2))
}

export function initUserscripts(userDataPath: string) {
  rootDir = join(userDataPath, 'userscripts')
  fs.mkdirSync(rootDir, { recursive: true })
  index = readIndex()
}

export function getUserscriptsDir() {
  return rootDir
}

const findEntry = (id: string) => index.scripts.find((script) => script.id === id)

function toInfo(entry: UserscriptEntry): UserscriptInfo {
  const assetErrors = [...entry.requires, ...entry.resources]
    .filter((asset) => asset.error !== null)
    .map((asset) => `${asset.url}: ${asset.error}`)

  return { ...entry, assetErrors }
}

export function listUserscripts(): UserscriptInfo[] {
  return index.scripts.map(toInfo)
}

export function getUserscriptSource(id: string): string | null {
  try {
    return fs.readFileSync(scriptPath(id), 'utf8')
  } catch {
    return null
  }
}

async function downloadAssets(
  id: string,
  urls: string[],
  kind: 'requires' | 'resources'
): Promise<UserscriptAssetEntry[]> {
  fs.mkdirSync(join(scriptDir(id), kind), { recursive: true })

  return Promise.all(
    urls.map(async (url): Promise<UserscriptAssetEntry> => {
      const file = assetPath(id, kind, url)
      try {
        const asset = await fetchAsset(url)
        fs.writeFileSync(file, new Uint8Array(asset.data))
        return { url, file, mimeType: asset.mimeType, error: null }
      } catch (err) {
        // Keep any previously cached copy so an offline install/update still runs.
        const cached = fs.existsSync(file)
        return {
          url,
          file,
          mimeType: 'application/octet-stream',
          error: cached ? null : String(err instanceof Error ? err.message : err)
        }
      }
    })
  )
}

async function install(source: string, origin: UserscriptEntry['origin']): Promise<UserscriptInfo> {
  const meta = parseMetadata(source)
  const id = scriptId(meta)
  const existing = findEntry(id)

  fs.mkdirSync(scriptDir(id), { recursive: true })
  fs.writeFileSync(scriptPath(id), source, 'utf8')

  const requires = await downloadAssets(id, meta.requires, 'requires')
  const resourceAssets = await downloadAssets(
    id,
    meta.resources.map((resource) => resource.url),
    'resources'
  )
  const resources = meta.resources.map((resource, i) => ({
    ...resourceAssets[i],
    name: resource.name
  }))

  const now = Date.now()
  const entry: UserscriptEntry = {
    id,
    // Reinstalling an existing script keeps its enabled state and values.
    enabled: existing ? existing.enabled : true,
    origin,
    installedAt: existing ? existing.installedAt : now,
    updatedAt: now,
    meta,
    requires,
    resources
  }

  if (existing) {
    index.scripts[index.scripts.indexOf(existing)] = entry
  } else {
    index.scripts.push(entry)
  }

  writeIndex()
  payloadCache.delete(id)

  return toInfo(entry)
}

export async function installFromFile(filePath: string): Promise<UserscriptInfo> {
  return install(fs.readFileSync(filePath, 'utf8'), { type: 'file', url: null })
}

export async function installFromUrl(url: string): Promise<UserscriptInfo> {
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new UserscriptParseError('Only http(s) URLs can be installed')
  }
  return install(await fetchText(trimmed), { type: 'url', url: trimmed })
}

export function setUserscriptEnabled(id: string, enabled: boolean): boolean {
  const entry = findEntry(id)
  if (!entry) return false

  entry.enabled = enabled
  writeIndex()
  payloadCache.delete(id)
  return true
}

export function removeUserscript(id: string): boolean {
  const entry = findEntry(id)
  if (!entry) return false

  index.scripts.splice(index.scripts.indexOf(entry), 1)
  writeIndex()
  payloadCache.delete(id)
  valueCache.delete(id)

  fs.rmSync(scriptDir(id), { recursive: true, force: true })
  return true
}

/**
 * Re-downloads from @downloadURL (falling back to @updateURL, then the install
 * URL) and reinstalls when the remote @version differs.
 */
export async function updateUserscript(id: string): Promise<UserscriptUpdateResult> {
  const entry = findEntry(id)
  if (!entry) return { ok: false, updated: false, error: 'Script not found' }

  const url = entry.meta.downloadUrl ?? entry.meta.updateUrl ?? entry.origin.url
  if (!url) {
    return { ok: false, updated: false, error: 'Script has no @downloadURL to update from' }
  }

  try {
    const source = await fetchText(url)
    const remote = parseMetadata(source)
    if (remote.version === entry.meta.version) {
      return { ok: true, updated: false, version: entry.meta.version }
    }

    await install(source, { type: 'url', url })
    return { ok: true, updated: true, version: remote.version }
  } catch (err) {
    return { ok: false, updated: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// -- GM value storage --------------------------------------------------------
// Values are stored as JSON *strings* so the renderer can hand them straight to
// the injected script without a second round of serialisation.

export function getValues(id: string): Record<string, string> {
  const cached = valueCache.get(id)
  if (cached) return cached

  let values: Record<string, string> = {}
  try {
    const parsed = JSON.parse(fs.readFileSync(valuesPath(id), 'utf8'))
    if (parsed && typeof parsed === 'object') values = parsed
  } catch {
    // No stored values yet.
  }

  valueCache.set(id, values)
  return values
}

const pendingWrites = new Set<string>()

function scheduleValueWrite(id: string) {
  if (pendingWrites.has(id)) return
  pendingWrites.add(id)

  setTimeout(() => {
    pendingWrites.delete(id)
    const values = valueCache.get(id)
    if (!values) return

    try {
      fs.mkdirSync(scriptDir(id), { recursive: true })
      fs.writeFileSync(valuesPath(id), JSON.stringify(values))
    } catch (err) {
      console.error('[userscripts] failed to persist values for', id, err)
    }
  }, 200)
}

/** `value` is a JSON string, or null to delete the key. */
export function setValue(id: string, key: string, value: string | null) {
  if (!findEntry(id)) return

  const values = getValues(id)
  if (value === null) {
    delete values[key]
  } else {
    values[key] = value
  }

  const payload = payloadCache.get(id)
  if (payload) payload.values = { ...values }

  scheduleValueWrite(id)
}

// -- Injection payloads ------------------------------------------------------

function readResourcePayload(
  resource: UserscriptAssetEntry & { name: string }
): UserscriptResourcePayload {
  const empty = { url: resource.url, mimeType: resource.mimeType, text: null, dataUrl: '' }

  try {
    const stats = fs.statSync(resource.file)
    if (stats.size > MAX_RESOURCE_BYTES) return empty

    const data = fs.readFileSync(resource.file)
    const isText = /^(text\/|application\/(json|javascript|xml))/.test(resource.mimeType)

    return {
      url: resource.url,
      mimeType: resource.mimeType,
      text: isText ? data.toString('utf8') : null,
      dataUrl: `data:${resource.mimeType};base64,${data.toString('base64')}`
    }
  } catch {
    return empty
  }
}

function buildPayload(entry: UserscriptEntry): UserscriptPayload | null {
  const cached = payloadCache.get(entry.id)
  if (cached) return cached

  const code = getUserscriptSource(entry.id)
  if (code === null) return null

  const requires = entry.requires.map((require) => {
    try {
      return fs.readFileSync(require.file, 'utf8')
    } catch {
      return ''
    }
  })

  const resources: Record<string, UserscriptResourcePayload> = {}
  for (const resource of entry.resources) {
    resources[resource.name] = readResourcePayload(resource)
  }

  const payload: UserscriptPayload = {
    id: entry.id,
    name: entry.meta.name,
    version: entry.meta.version,
    runAt: entry.meta.runAt,
    noframes: entry.meta.noframes,
    grants: entry.meta.grants,
    code,
    requires,
    values: { ...getValues(entry.id) },
    resources,
    info: {
      script: {
        name: entry.meta.name,
        namespace: entry.meta.namespace,
        version: entry.meta.version,
        description: entry.meta.description,
        author: entry.meta.author,
        icon: entry.meta.icon,
        homepage: entry.meta.homepage,
        includes: entry.meta.includes,
        excludes: entry.meta.excludes,
        matches: entry.meta.matches,
        resources: entry.meta.resources,
        'run-at': entry.meta.runAt,
        grant: entry.meta.grants ?? ['none']
      },
      scriptMetaStr: entry.meta.metaStr,
      scriptHandler: 'ChatGuessr',
      scriptWillUpdate: false,
      isIncognito: false,
      downloadMode: 'browser'
    }
  }

  payloadCache.set(entry.id, payload)
  return payload
}

/** Everything the preload needs to inject into a page at `url`. */
export function getPayloadsForUrl(url: string): UserscriptPayload[] {
  const payloads: UserscriptPayload[] = []

  for (const entry of index.scripts) {
    if (!entry.enabled) continue
    if (!matchesUrl(entry.meta, url)) continue

    const payload = buildPayload(entry)
    if (payload) payloads.push(payload)
  }

  return payloads
}

/** Domains a script is allowed to reach through GM_xmlhttpRequest. */
export function getConnects(id: string): string[] {
  return findEntry(id)?.meta.connects ?? []
}

export function isInstalled(id: string): boolean {
  return findEntry(id) !== undefined
}
