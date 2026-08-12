// URL matching for @match (Chrome match patterns) and @include/@exclude
// (Tampermonkey globs, or /regex/ when wrapped in slashes).

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const globToSource = (glob: string) => escapeRegExp(glob).replace(/\\\*/g, '.*')

const MATCH_PATTERN_RE = /^(\*|https?|file|ftp|urn):\/\/([^/]*)(\/.*)$/

/**
 * Chrome match pattern → RegExp. Returns null for patterns we can't parse, so
 * a malformed @match line never accidentally matches every page.
 */
export function matchPatternToRegExp(pattern: string): RegExp | null {
  if (pattern === '<all_urls>') return /^(?:https?|file|ftp):\/\//

  const parts = MATCH_PATTERN_RE.exec(pattern)
  if (!parts) return null

  const [, scheme, host, path] = parts

  const schemeSource = scheme === '*' ? '(?:https?)' : escapeRegExp(scheme)

  let hostSource: string
  if (host === '*') {
    hostSource = '[^/]+'
  } else if (host.startsWith('*.')) {
    hostSource = '(?:[^/]+\\.)?' + escapeRegExp(host.slice(2))
  } else if (host === '') {
    hostSource = ''
  } else {
    hostSource = escapeRegExp(host)
  }

  try {
    return new RegExp(`^${schemeSource}://${hostSource}${globToSource(path)}$`)
  } catch {
    return null
  }
}

/** @include / @exclude rule → RegExp. Supports both `*` globs and `/regex/`. */
export function includeRuleToRegExp(rule: string): RegExp | null {
  if (rule.length > 2 && rule.startsWith('/') && rule.endsWith('/')) {
    try {
      return new RegExp(rule.slice(1, -1))
    } catch {
      return null
    }
  }

  // A bare `*` (or a rule with no scheme) still has to match the whole URL.
  try {
    return new RegExp(`^${globToSource(rule)}$`)
  } catch {
    return null
  }
}

const anyMatches = (rules: string[], url: string, toRegExp: (rule: string) => RegExp | null) =>
  rules.some((rule) => {
    const regExp = toRegExp(rule)
    return regExp ? regExp.test(url) : false
  })

/**
 * Mirrors Tampermonkey's resolution order: a script runs when it is included by
 * at least one @match or @include and not knocked out by an @exclude. A script
 * declaring neither @match nor @include defaults to `@include *`.
 */
export function matchesUrl(meta: UserscriptMeta, url: string): boolean {
  const excluded =
    anyMatches(meta.excludes, url, includeRuleToRegExp) ||
    anyMatches(meta.excludes, url, matchPatternToRegExp)
  if (excluded) return false

  if (meta.matches.length === 0 && meta.includes.length === 0) return true

  return (
    anyMatches(meta.matches, url, matchPatternToRegExp) ||
    anyMatches(meta.includes, url, includeRuleToRegExp)
  )
}
