import { describe, expect, it } from 'vitest'
import { findGuessMap } from './guessMap'

function setup() {
  const div = { isConnected: true } as HTMLElement
  const canvas = {
    contains: (element: HTMLElement) => element === div,
    parentElement: null
  } as unknown as HTMLElement
  const map = { getDiv: () => div }
  return { canvas, div, map }
}

describe('guess map resolution', () => {
  it('finds a captured map even when its canvas is assigned after construction', () => {
    const { canvas, map } = setup()
    const otherMap = { getDiv: () => ({ isConnected: true }) as HTMLElement }
    expect(findGuessMap(canvas, [otherMap, map])).toBe(map)
  })

  it('recovers a map created before the overlay hook from React ancestors', () => {
    const { canvas, map } = setup()
    Object.assign(canvas, {
      __reactFiber$test: {
        return: { return: { return: { memoizedProps: { map } } } }
      }
    })
    expect(findGuessMap(canvas, [])).toBe(map)
  })

  it('rejects disconnected maps and maps belonging to a results canvas', () => {
    const { canvas, map, div } = setup()
    Object.defineProperty(div, 'isConnected', { value: false })
    Object.assign(canvas, { __reactFiber$test: { memoizedProps: { map } } })
    const resultsMap = { getDiv: () => ({ isConnected: true }) as HTMLElement }
    expect(findGuessMap(canvas, [map, resultsMap])).toBeUndefined()
  })

  it('bounds traversal when React fibers contain a cycle', () => {
    const { canvas } = setup()
    const fiber: { return?: unknown } = {}
    fiber.return = fiber
    Object.assign(canvas, { __reactFiber$test: fiber })
    expect(findGuessMap(canvas, [])).toBeUndefined()
  })
})
