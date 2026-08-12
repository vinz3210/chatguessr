// Parser for the `// ==UserScript== ... // ==/UserScript==` block that
// Tampermonkey/Greasemonkey scripts carry at the top of the file.

const BLOCK_RE = /\/\/[ \t]*==UserScript==([\s\S]*?)\/\/[ \t]*==\/UserScript==/
const LINE_RE = /^[ \t]*\/\/[ \t]*@([\w-]+(?::[\w-]+)?)[ \t]*(.*)$/

const RUN_AT_VALUES: UserscriptRunAt[] = [
  'document-start',
  'document-body',
  'document-end',
  'document-idle'
]

export class UserscriptParseError extends Error {}

/** Extracts the raw metadata block, including the `==UserScript==` delimiters. */
export function extractMetaBlock(source: string): string | null {
  const match = BLOCK_RE.exec(source)
  return match ? match[0] : null
}

/**
 * Reads every `@key value` line of the metadata block. Keys can repeat, so
 * values are always collected into an array. Localized keys (`@name:de`) are
 * dropped — we only ever display the untranslated value.
 */
function readTags(metaStr: string): Map<string, string[]> {
  const tags = new Map<string, string[]>()

  for (const line of metaStr.split(/\r?\n/)) {
    const match = LINE_RE.exec(line)
    if (!match) continue

    const key = match[1]
    if (key.includes(':')) continue

    const value = match[2].trim()
    const existing = tags.get(key)
    if (existing) {
      existing.push(value)
    } else {
      tags.set(key, [value])
    }
  }

  return tags
}

const first = (tags: Map<string, string[]>, ...keys: string[]): string | null => {
  for (const key of keys) {
    const values = tags.get(key)
    if (values && values[0]) return values[0]
  }
  return null
}

const all = (tags: Map<string, string[]>, ...keys: string[]): string[] =>
  keys.flatMap((key) => tags.get(key) ?? []).filter((value) => value !== '')

/**
 * `@resource <name> <url>` — the name is the first whitespace separated token.
 */
function parseResources(values: string[]): UserscriptResourceRef[] {
  const resources: UserscriptResourceRef[] = []

  for (const value of values) {
    const separator = value.search(/\s/)
    if (separator === -1) continue

    const name = value.slice(0, separator)
    const url = value.slice(separator + 1).trim()
    if (name && url) resources.push({ name, url })
  }

  return resources
}

export function parseMetadata(source: string): UserscriptMeta {
  const metaStr = extractMetaBlock(source)
  if (!metaStr) {
    throw new UserscriptParseError('No // ==UserScript== metadata block found')
  }

  const tags = readTags(metaStr)

  const name = first(tags, 'name')
  if (!name) {
    throw new UserscriptParseError('Metadata block has no @name')
  }

  const runAtTag = first(tags, 'run-at')
  const runAt = RUN_AT_VALUES.find((value) => value === runAtTag) ?? 'document-idle'

  // A script with no @grant at all runs with every API available; an explicit
  // `@grant none` is an empty grant list.
  const grantTags = all(tags, 'grant')
  const grants = grantTags.length === 0 ? null : grantTags.filter((grant) => grant !== 'none')

  return {
    name,
    namespace: first(tags, 'namespace') ?? '',
    version: first(tags, 'version') ?? '0.0.0',
    description: first(tags, 'description') ?? '',
    author: first(tags, 'author') ?? '',
    icon: first(tags, 'icon', 'iconURL', 'defaulticon', 'icon64', 'icon64URL'),
    homepage: first(tags, 'homepage', 'homepageURL', 'website', 'source'),
    supportUrl: first(tags, 'supportURL'),
    downloadUrl: first(tags, 'downloadURL'),
    updateUrl: first(tags, 'updateURL'),
    matches: all(tags, 'match'),
    includes: all(tags, 'include'),
    excludes: all(tags, 'exclude', 'exclude-match'),
    requires: all(tags, 'require'),
    resources: parseResources(all(tags, 'resource')),
    connects: all(tags, 'connect'),
    grants,
    runAt,
    noframes: tags.has('noframes'),
    metaStr
  }
}
