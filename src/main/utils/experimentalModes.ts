// Startup-only: deliberately separate from the persisted user settings.
export const experimentalModesEnabled = process.argv.includes('--experimental-modes')

export const experimentalModeToggles = [
  'isTMPZModeEnabled',
  'peepholeModeEnabled',
  'progressiveZoomModeEnabled',
  'aiDescriptionMode',
  'ttsEnabled'
] as const

export function applyExperimentalModes(settings: Settings, enabled: boolean): Settings {
  const effectiveSettings = { ...settings }
  if (!enabled) {
    for (const key of experimentalModeToggles) effectiveSettings[key] = false
  }
  return effectiveSettings
}
