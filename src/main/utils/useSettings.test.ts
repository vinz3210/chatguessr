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

async function launch(enabled: boolean) {
  vi.resetModules()
  vi.doMock('./experimentalModes', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./experimentalModes')>()),
    experimentalModesEnabled: enabled
  }))
  return import('./useSettings')
}

describe('experimental settings across launches', () => {
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

  it('keeps hidden modes inactive and restores their saved choices on a flagged launch', async () => {
    const normal = await launch(false)
    expect(normal.settings.isTMPZModeEnabled).toBe(false)
    expect(normal.settings.peepholeModeEnabled).toBe(false)
    expect(normal.settings.progressiveZoomModeEnabled).toBe(false)
    expect(normal.settings.aiDescriptionMode).toBe(false)
    expect(normal.settings.ttsEnabled).toBe(false)

    normal.saveSettings({ ...normal.settings, guessMarkersLimit: 50, aiDescriptionMode: true })
    expect(normal.settings.aiDescriptionMode).toBe(false)
    expect(saved.settings.guessMarkersLimit).toBe(50)

    const experimental = await launch(true)
    expect(experimental.settings.isTMPZModeEnabled).toBe(true)
    expect(experimental.settings.peepholeModeEnabled).toBe(true)
    expect(experimental.settings.progressiveZoomModeEnabled).toBe(true)
    expect(experimental.settings.progressiveZoomAffectedPoints).toBe(2500)
    expect(experimental.settings.aiDescriptionMode).toBe(true)
    expect(experimental.settings.ttsEnabled).toBe(true)
    expect(experimental.settings.peepholeSize).toBe('large')
    expect(experimental.settings.aiDescriptionModel).toBe('saved-vision-model')
    expect(experimental.settings.ttsVoice).toBe('saved-voice')
    expect(experimental.settings.guessMarkersLimit).toBe(50)
  })

  it('saves experimental mode changes when the flag is enabled', async () => {
    const experimental = await launch(true)
    experimental.saveSettings({
      ...experimental.settings,
      isTMPZModeEnabled: false,
      progressiveZoomModeEnabled: false,
      progressiveZoomAffectedPoints: 1000
    })
    const restarted = await launch(true)
    expect(restarted.settings.isTMPZModeEnabled).toBe(false)
    expect(restarted.settings.peepholeModeEnabled).toBe(true)
    expect(restarted.settings.progressiveZoomModeEnabled).toBe(false)
    expect(restarted.settings.progressiveZoomAffectedPoints).toBe(1000)
  })
})
