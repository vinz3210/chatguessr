import { describe, expect, it } from 'vitest'
import { progressiveZoomLevel } from './progressiveZoomVisual'

describe('progressiveZoomLevel', () => {
  it('begins visibly zooming out within two seconds even with a long CG timer', () => {
    expect(progressiveZoomLevel(1, 0, 180_000)).toBe(4)
    expect(progressiveZoomLevel(1, 1000, 180_000)).toBe(3.5)
    expect(progressiveZoomLevel(1, 2000, 180_000)).toBe(3)
    expect(progressiveZoomLevel(1, 180_000, 180_000)).toBe(1)
  })

  it('continues smoothly after the first step', () => {
    expect(progressiveZoomLevel(1, 3000, 45_000)).toBeLessThan(3)
    expect(progressiveZoomLevel(1, 3000, 45_000)).toBeGreaterThan(1)
  })
})
