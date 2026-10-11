import { afterEach, describe, expect, it, vi } from 'vitest'
import { startAutoCgMap } from './autoCgDom'

afterEach(() => {
  vi.unstubAllGlobals()
})

function playButton(disabled = false, visible = true) {
  return {
    disabled,
    getClientRects: () => (visible ? [{}] : []),
    closest: () => ({ className: 'function-lock_blurWrapper__NlD1J' }),
    click: vi.fn()
  }
}

describe('AutoCG Play button', () => {
  it('clicks an enabled Play button even inside a function-lock wrapper', () => {
    const button = playButton()
    vi.stubGlobal('document', { querySelectorAll: () => [button] })
    expect(startAutoCgMap()).toBe(true)
    expect(button.click).toHaveBeenCalledOnce()
  })

  it('ignores hidden responsive duplicates and disabled Play buttons', () => {
    const hidden = playButton(false, false)
    const disabled = playButton(true)
    const enabled = playButton()
    vi.stubGlobal('document', { querySelectorAll: () => [hidden, disabled, enabled] })
    expect(startAutoCgMap()).toBe(true)
    expect(hidden.click).not.toHaveBeenCalled()
    expect(disabled.click).not.toHaveBeenCalled()
    expect(enabled.click).toHaveBeenCalledOnce()
  })

  it('waits when no enabled Play button is available', () => {
    const button = playButton(true)
    vi.stubGlobal('document', { querySelectorAll: () => [button] })
    expect(startAutoCgMap()).toBe(false)
    expect(button.click).not.toHaveBeenCalled()
  })
})
