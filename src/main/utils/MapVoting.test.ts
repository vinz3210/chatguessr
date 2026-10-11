import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MapVoting, { parseAutoCgMaps, sampleAutoCgMaps, type AutoCgMap } from './MapVoting'

const maps: AutoCgMap[] = [
  { name: 'First', URL: '111111111111111111111111', weight: 100 },
  { name: 'Second', URL: '222222222222222222222222', weight: 20 },
  { name: 'Third', URL: '333333333333333333333333', weight: 5 }
]

describe('AutoCG map voting', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => maps }))
    )
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('validates the remote pool and samples unique maps without mutating it', () => {
    expect(
      parseAutoCgMaps([...maps, maps[0], { ...maps[0], URL: 'https://evil.example' }])
    ).toEqual(maps)
    expect(sampleAutoCgMaps(maps, () => 0).map((map) => map.URL)).toEqual(
      maps.map((map) => map.URL)
    )
    expect(maps[0]).not.toHaveProperty('emote')
  })

  it('counts one current vote per user, closes early at game end, and ignores late votes', async () => {
    const announce = vi.fn<[string], Promise<void>>(async () => {})
    const voting = new MapVoting(announce)
    await voting.start()
    voting.vote('player', '!vote 1')
    voting.vote('player', '!vote 2')
    await voting.finish()
    voting.vote('late-player', '!vote 3')
    expect(await voting.takeNextMap()).toEqual({ id: maps[1].URL, nmpz: false })
    expect(announce).toHaveBeenLastCalledWith('The next map is Second!')
    expect(await voting.takeNextMap()).toBeNull()
  })

  it('picks a fallback winner without votes and announces it once', async () => {
    const announce = vi.fn<[string], Promise<void>>(async () => {})
    const voting = new MapVoting(announce)
    await voting.start()
    await vi.advanceTimersByTimeAsync(150000)
    await voting.finish()
    expect(await voting.takeNextMap()).toEqual({ id: maps[0].URL, nmpz: false })
    expect(
      announce.mock.calls.filter(([message]) => message === 'The next map is First!')
    ).toHaveLength(1)
  })

  it('cancels a vote whose map fetch finishes after automation was switched off', async () => {
    let resolve!: (value: unknown) => void
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((done) => {
            resolve = done
          })
      )
    )
    const announce = vi.fn<[string], Promise<void>>(async () => {})
    const voting = new MapVoting(announce)
    const pending = voting.start()
    voting.cancel()
    resolve({ ok: true, json: async () => maps })
    await pending
    expect(announce).not.toHaveBeenCalled()
    expect(await voting.takeNextMap()).toBeNull()
  })
})
