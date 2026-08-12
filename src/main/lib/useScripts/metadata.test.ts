import { describe, it, expect } from 'vitest'
import { parseMetadata, UserscriptParseError } from './metadata'

const script = (block: string, body = 'console.log(1)') =>
  `// ==UserScript==\n${block}\n// ==/UserScript==\n${body}\n`

describe('parseMetadata', () => {
  it('reads the common tags', () => {
    const meta = parseMetadata(
      script(
        [
          '// @name         GeoGuessr Resolver',
          '// @namespace    http://example.com',
          '// @version      1.4.2',
          '// @description  Does a thing',
          '// @author       someone',
          '// @match        https://www.geoguessr.com/*',
          '// @run-at       document-start',
          '// @noframes'
        ].join('\n')
      )
    )

    expect(meta.name).toBe('GeoGuessr Resolver')
    expect(meta.namespace).toBe('http://example.com')
    expect(meta.version).toBe('1.4.2')
    expect(meta.description).toBe('Does a thing')
    expect(meta.author).toBe('someone')
    expect(meta.matches).toEqual(['https://www.geoguessr.com/*'])
    expect(meta.runAt).toBe('document-start')
    expect(meta.noframes).toBe(true)
  })

  it('collects repeated tags', () => {
    const meta = parseMetadata(
      script(
        [
          '// @name    Multi',
          '// @match   https://www.geoguessr.com/*',
          '// @match   https://geoguessr.com/*',
          '// @exclude https://www.geoguessr.com/admin*',
          '// @require https://cdn.example.com/lib.js',
          '// @grant   GM_setValue',
          '// @grant   GM_getValue',
          '// @connect example.com'
        ].join('\n')
      )
    )

    expect(meta.matches).toHaveLength(2)
    expect(meta.excludes).toEqual(['https://www.geoguessr.com/admin*'])
    expect(meta.requires).toEqual(['https://cdn.example.com/lib.js'])
    expect(meta.grants).toEqual(['GM_setValue', 'GM_getValue'])
    expect(meta.connects).toEqual(['example.com'])
  })

  it('distinguishes "@grant none" from no @grant at all', () => {
    expect(parseMetadata(script('// @name X\n// @grant none')).grants).toEqual([])
    expect(parseMetadata(script('// @name X')).grants).toBeNull()
  })

  it('parses "@resource <name> <url>"', () => {
    const meta = parseMetadata(
      script('// @name X\n// @resource  style   https://example.com/a.css')
    )
    expect(meta.resources).toEqual([{ name: 'style', url: 'https://example.com/a.css' }])
  })

  it('ignores localized tags', () => {
    const meta = parseMetadata(script('// @name X\n// @name:de Y\n// @description:de Z'))
    expect(meta.name).toBe('X')
    expect(meta.description).toBe('')
  })

  it('falls back to document-idle for a missing or unknown @run-at', () => {
    expect(parseMetadata(script('// @name X')).runAt).toBe('document-idle')
    expect(parseMetadata(script('// @name X\n// @run-at nonsense')).runAt).toBe('document-idle')
  })

  it('rejects a file with no metadata block', () => {
    expect(() => parseMetadata('console.log(1)')).toThrow(UserscriptParseError)
  })

  it('rejects a metadata block with no @name', () => {
    expect(() => parseMetadata(script('// @version 1.0'))).toThrow(UserscriptParseError)
  })
})
