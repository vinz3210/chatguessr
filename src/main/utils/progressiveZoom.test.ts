import { describe, expect, it } from 'vitest'
import { progressiveZoomScore } from './progressiveZoom'

describe('progressiveZoomScore', () => {
  it('uses the configured timer duration and caps the speed factor there', () => {
    expect(progressiveZoomScore(5000, 1000, 1000, 90000, 5000)).toBe(5000)
    expect(progressiveZoomScore(5000, 46000, 1000, 90000, 5000)).toBe(2500)
    expect(progressiveZoomScore(5000, 91000, 1000, 90000, 5000)).toBe(0)
    expect(progressiveZoomScore(5000, 200000, 1000, 90000, 5000)).toBe(0)
  })

  it('only reduces the selected share of the accuracy score', () => {
    expect(progressiveZoomScore(5000, 46000, 1000, 90000, 2500)).toBe(3750)
    expect(progressiveZoomScore(5000, 91000, 1000, 90000, 2500)).toBe(2500)
    expect(progressiveZoomScore(3000, 91000, 1000, 90000, 2500)).toBe(1500)
    expect(progressiveZoomScore(3000, 91000, 1000, 90000, 0)).toBe(3000)
  })

  it('preserves zero and penalty scores', () => {
    expect(progressiveZoomScore(0, 46000, 1000, 90000, 5000)).toBe(0)
    expect(progressiveZoomScore(-100, 46000, 1000, 90000, 5000)).toBe(-100)
  })
})
