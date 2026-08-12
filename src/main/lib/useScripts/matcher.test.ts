import { describe, it, expect } from 'vitest'
import { matchPatternToRegExp, includeRuleToRegExp, matchesUrl } from './matcher'

const meta = (overrides: Partial<UserscriptMeta>): UserscriptMeta => ({
  name: 'test',
  namespace: '',
  version: '1.0',
  description: '',
  author: '',
  icon: null,
  homepage: null,
  supportUrl: null,
  downloadUrl: null,
  updateUrl: null,
  matches: [],
  includes: [],
  excludes: [],
  requires: [],
  resources: [],
  connects: [],
  grants: null,
  runAt: 'document-idle',
  noframes: false,
  metaStr: '',
  ...overrides
})

describe('matchPatternToRegExp', () => {
  it('matches host and path globs', () => {
    const pattern = matchPatternToRegExp('https://www.geoguessr.com/game/*')!
    expect(pattern.test('https://www.geoguessr.com/game/abc')).toBe(true)
    expect(pattern.test('https://www.geoguessr.com/maps/world')).toBe(false)
    expect(pattern.test('http://www.geoguessr.com/game/abc')).toBe(false)
  })

  it('treats a leading *. as an optional subdomain', () => {
    const pattern = matchPatternToRegExp('https://*.geoguessr.com/*')!
    expect(pattern.test('https://www.geoguessr.com/maps')).toBe(true)
    expect(pattern.test('https://geoguessr.com/maps')).toBe(true)
    expect(pattern.test('https://geoguessr.com.evil.test/maps')).toBe(false)
  })

  it('expands the * scheme to http and https only', () => {
    const pattern = matchPatternToRegExp('*://example.com/*')!
    expect(pattern.test('http://example.com/a')).toBe(true)
    expect(pattern.test('https://example.com/a')).toBe(true)
    expect(pattern.test('ftp://example.com/a')).toBe(false)
  })

  it('handles <all_urls>', () => {
    expect(matchPatternToRegExp('<all_urls>')!.test('https://anything.test/x')).toBe(true)
  })

  it('returns null for a malformed pattern instead of matching everything', () => {
    expect(matchPatternToRegExp('www.geoguessr.com')).toBeNull()
    expect(matchPatternToRegExp('https://www.geoguessr.com')).toBeNull()
  })
})

describe('includeRuleToRegExp', () => {
  it('anchors glob rules', () => {
    const rule = includeRuleToRegExp('https://*.geoguessr.com/game*')!
    expect(rule.test('https://www.geoguessr.com/game/abc')).toBe(true)
    expect(rule.test('https://www.geoguessr.com/maps')).toBe(false)
  })

  it('supports /regex/ rules', () => {
    const rule = includeRuleToRegExp('/geoguessr\\.com\\/game/')!
    expect(rule.test('https://www.geoguessr.com/game/abc')).toBe(true)
  })

  it('returns null for an invalid regex', () => {
    expect(includeRuleToRegExp('/[unterminated/')).toBeNull()
  })
})

describe('matchesUrl', () => {
  const url = 'https://www.geoguessr.com/game/abc'

  it('runs a script with neither @match nor @include everywhere', () => {
    expect(matchesUrl(meta({}), url)).toBe(true)
  })

  it('requires at least one @match or @include to hit', () => {
    expect(matchesUrl(meta({ matches: ['https://www.geoguessr.com/maps/*'] }), url)).toBe(false)
    expect(matchesUrl(meta({ matches: ['https://www.geoguessr.com/game/*'] }), url)).toBe(true)
    expect(matchesUrl(meta({ includes: ['*geoguessr.com/game*'] }), url)).toBe(true)
  })

  it('lets @exclude override a hit', () => {
    const script = meta({
      matches: ['https://www.geoguessr.com/*'],
      excludes: ['https://www.geoguessr.com/game/*']
    })
    expect(matchesUrl(script, url)).toBe(false)
    expect(matchesUrl(script, 'https://www.geoguessr.com/maps/world')).toBe(true)
  })
})
