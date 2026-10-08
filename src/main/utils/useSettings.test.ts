import { beforeEach, describe, expect, it, vi } from 'vitest'

const { saved, store } = vi.hoisted(() => {
  const saved: { settings: Partial<Settings> } = { settings: {} }
  return {
    saved,
    store: {
      get: vi.fn(() => saved.settings),
      set: vi.fn((_key: string, settings: Settings) => {
        saved.settings = { ...settings }
      })
    }
  }
})

vi.mock('./store', () => ({ store }))

async function launch() {
  vi.resetModules()
  return import('./useSettings')
}

describe('experimental settings in normal launches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    saved.settings = {
      isTMPZModeEnabled: true,
      peepholeModeEnabled: true,
      peepholeSize: 'large',
      progressiveZoomModeEnabled: true,
      progressiveZoomAffectedPoints: 2500,
      aiDescriptionMode: true,
      ttsEnabled: true,
      aiDescriptionModel: 'saved-vision-model',
      ttsVoice: 'saved-voice'
    }
  })

  it('restores saved experimental choices without a startup flag', async () => {
    const app = await launch()
    expect(app.settings.isTMPZModeEnabled).toBe(true)
    expect(app.settings.peepholeModeEnabled).toBe(true)
    expect(app.settings.progressiveZoomModeEnabled).toBe(true)
    expect(app.settings.aiDescriptionMode).toBe(true)
    expect(app.settings.ttsEnabled).toBe(true)
    expect(app.settings.progressiveZoomAffectedPoints).toBe(2500)
    expect(app.settings.aiDescriptionModel).toBe('saved-vision-model')
    expect(app.settings.ttsVoice).toBe('saved-voice')
  })

  it('saves experimental changes and ordinary settings together', async () => {
    const app = await launch()
    app.saveSettings({
      ...app.settings,
      guessMarkersLimit: 50,
      progressiveZoomModeEnabled: false,
      progressiveZoomAffectedPoints: 1000
    })
    const restarted = await launch()
    expect(restarted.settings.guessMarkersLimit).toBe(50)
    expect(restarted.settings.progressiveZoomModeEnabled).toBe(false)
    expect(restarted.settings.progressiveZoomAffectedPoints).toBe(1000)
    expect(restarted.settings.isTMPZModeEnabled).toBe(true)
  })

  it('leaves experimental features off for a fresh configuration', async () => {
    saved.settings = {}
    const app = await launch()
    expect(app.settings.isTMPZModeEnabled).toBe(false)
    expect(app.settings.peepholeModeEnabled).toBe(false)
    expect(app.settings.progressiveZoomModeEnabled).toBe(false)
    expect(app.settings.aiDescriptionMode).toBe(false)
    expect(app.settings.ttsEnabled).toBe(false)
  })
})
