import { describe, expect, it } from 'vitest'
import { isAutoCgGamePage, isAutoCgMapPage } from './autoCgMapStart'

describe('AutoCG map navigation', () => {
  it('accepts community maps and official map slugs after a locale redirect', () => {
    expect(isAutoCgMapPage('/de/maps/62a44b22040f04bd36e8a914', '62a44b22040f04bd36e8a914')).toBe(
      true
    )
    expect(isAutoCgMapPage('/maps/world', 'world')).toBe(true)
    expect(isAutoCgMapPage('/en/maps/united-states/', 'united-states')).toBe(true)
  })

  it('rejects unrelated pages and invalid map IDs', () => {
    expect(isAutoCgMapPage('/maps/world', 'europe')).toBe(false)
    expect(isAutoCgMapPage('/maps/world', '../world')).toBe(false)
    expect(isAutoCgMapPage('/maps/world', '')).toBe(false)
  })

  it('only treats actual game navigation as a successful start', () => {
    expect(isAutoCgGamePage('/maps/world')).toBe(false)
    expect(isAutoCgGamePage('/de/maps/world')).toBe(false)
    expect(isAutoCgGamePage('/game/roundToken')).toBe(true)
    expect(isAutoCgGamePage('/de/game/roundToken')).toBe(true)
    expect(isAutoCgGamePage('/results/roundToken')).toBe(false)
  })
})
