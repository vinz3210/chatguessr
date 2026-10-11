import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AutoCgLoop } from './autoCgLoop'

describe('AutoCG loop', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function setup() {
    let enabled = true
    const actions = {
      plonk: vi.fn<[AbortSignal?], Promise<boolean>>(async () => true),
      advance: vi.fn(() => true),
      replay: vi.fn(async () => true),
      status: vi.fn()
    }
    const loop = new AutoCgLoop({
      ...actions,
      enabled: () => enabled,
      resultsMs: () => 5000
    })
    return {
      loop,
      actions,
      disable: () => {
        enabled = false
      }
    }
  }

  it('plonks once at expiry, then waits for actual results before advancing', async () => {
    const { loop, actions } = setup()
    loop.transition('in-round')
    loop.expireRound()
    loop.expireRound()
    await vi.advanceTimersByTimeAsync(10000)
    expect(actions.plonk).toHaveBeenCalledTimes(1)
    expect(actions.advance).not.toHaveBeenCalled()
    loop.transition('round-results')
    await vi.advanceTimersByTimeAsync(4999)
    expect(actions.advance).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(actions.advance).toHaveBeenCalledTimes(1)
  })

  it('cancels pending progression when paused or disabled', async () => {
    const { loop, actions, disable } = setup()
    loop.transition('round-results')
    loop.setPaused(true)
    await vi.advanceTimersByTimeAsync(10000)
    expect(actions.advance).not.toHaveBeenCalled()
    loop.setPaused(false)
    disable()
    loop.transition('round-results', true)
    await vi.advanceTimersByTimeAsync(10000)
    expect(actions.advance).not.toHaveBeenCalled()
  })

  it('retries missing controls, stops after success, and cancels on navigation', async () => {
    const { loop, actions } = setup()
    actions.advance.mockReturnValueOnce(false)
    loop.transition('round-results')
    await vi.advanceTimersByTimeAsync(5500)
    expect(actions.advance).toHaveBeenCalledTimes(2)
    loop.transition('game-results')
    loop.transition('none')
    await vi.advanceTimersByTimeAsync(10000)
    expect(actions.replay).not.toHaveBeenCalled()
  })

  it('pauses after a bounded wait instead of clicking indefinitely', async () => {
    const { loop, actions } = setup()
    actions.advance.mockReturnValue(false)
    loop.transition('round-results')
    await vi.advanceTimersByTimeAsync(40000)
    const attempts = actions.advance.mock.calls.length
    expect(actions.status).toHaveBeenLastCalledWith(expect.stringContaining('AutoCG paused:'))
    await vi.advanceTimersByTimeAsync(40000)
    expect(actions.advance).toHaveBeenCalledTimes(attempts)
  })

  it('does nothing when expiry belongs to a results screen', async () => {
    const { loop, actions } = setup()
    loop.transition('game-results')
    loop.expireRound()
    await vi.advanceTimersByTimeAsync(5000)
    expect(actions.plonk).not.toHaveBeenCalled()
    expect(actions.replay).toHaveBeenCalledTimes(1)
  })

  it('aborts an already-started async plonk when the round changes', async () => {
    const { loop, actions } = setup()
    let complete!: (value: boolean) => void
    actions.plonk.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    loop.transition('in-round')
    loop.expireRound()
    await vi.advanceTimersByTimeAsync(0)
    const signal = actions.plonk.mock.calls[0][0]!
    expect(signal.aborted).toBe(false)
    loop.transition('round-results')
    expect(signal.aborted).toBe(true)
    complete(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(actions.plonk).toHaveBeenCalledTimes(1)
  })
})
