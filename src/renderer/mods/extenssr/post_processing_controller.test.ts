import { afterEach, describe, expect, it, vi } from 'vitest'
import PostProcessingController, { defaultPP } from './post_processing_controller'
import { ShaderError, ShaderPass } from './shader_pass'
import scrambleShader from './shaders/scramble.glsl?raw'
import tileRevealShader from './shaders/tile_reveal.glsl?raw'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('scramble settings', () => {
  it('parses the variable-grid scramble shader', () => {
    expect(ShaderPass.fromString(scrambleShader)).toBeInstanceOf(ShaderPass)
    expect(ShaderPass.fromString(tileRevealShader)).toBeInstanceOf(ShaderPass)
    expect(scrambleShader).toContain('scrambled[63]')
    expect(tileRevealShader).toContain('scrambled[63]')
  })

  it('changes the rescramble cadence when the interval changes', () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', {
      setInterval: (callback: () => void, interval: number) => setInterval(callback, interval)
    })

    const controller = new PostProcessingController()
    controller.rescramble = vi.fn()
    controller.updateState({ ...defaultPP(), rescramble: true, rescrambleTime: 200 })
    vi.advanceTimersByTime(450)
    expect(controller.rescramble).toHaveBeenCalledTimes(2)

    controller.updateState({ ...controller.state, rescrambleTime: 500 })
    vi.advanceTimersByTime(1100)
    expect(controller.rescramble).toHaveBeenCalledTimes(4)

    controller.updateState({ ...controller.state, rescramble: false })
    vi.advanceTimersByTime(1000)
    expect(controller.rescramble).toHaveBeenCalledTimes(4)
  })

  it('shuffles only the tiles in the selected grid', () => {
    for (const gridSize of [2, 3, 4, 5, 6, 7, 8]) {
      const controller = new PostProcessingController()
      controller.updateState({ ...defaultPP(), scramble: true, scrambleGridSize: gridSize })
      const shader = controller.assemblePasses()

      const tileCount = gridSize * gridSize
      expect(shader).not.toBeInstanceOf(ShaderError)
      if (shader instanceof ShaderError) throw shader
      expect(shader.rawString).toContain('uniform float scrambleGridSize;')
      expect(controller.state.scrambleState).toHaveLength(64)
      expect(controller.state.scrambleState.slice(0, tileCount).sort((a, b) => a - b)).toEqual(
        [...Array(tileCount).keys()]
      )
      expect(controller.state.scrambleState.slice(tileCount)).toEqual(
        [...Array(64 - tileCount).keys()].map((n) => n + tileCount)
      )
    }
  })

  it('selects exactly the requested number of random visible tiles', () => {
    const controller = new PostProcessingController()
    controller.updateState({ ...defaultPP(), tileReveal: true, visibleTileCount: 10 })

    const shader = controller.assemblePasses()
    expect(shader).not.toBeInstanceOf(ShaderError)
    if (shader instanceof ShaderError) throw shader
    expect(shader.rawString).toContain('uniform float visibleTileCount;')
    expect(controller.state.scrambleState.slice(0, 16).filter((rank) => rank < 10)).toHaveLength(10)

    controller.updateState({ ...controller.state, scrambleGridSize: 2 })
    expect(controller.state.visibleTileCount).toBe(4)
    expect(controller.state.scrambleState.slice(0, 4).filter((rank) => rank < 4)).toHaveLength(4)

    controller.updateState({ ...controller.state, scrambleGridSize: 8, visibleTileCount: 10 })
    expect(controller.state.scrambleState.filter((rank) => rank < 10)).toHaveLength(10)
    controller.updateState({ ...controller.state, visibleTileCount: 64 })
    expect(controller.state.visibleTileCount).toBe(64)
  })
})
