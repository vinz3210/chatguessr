// GeoGuessr's "face north" shortcut (N, press again to look straight down) is
// switched off whenever zooming is forbidden, because its look-down step also
// resets the zoom. NMNZ games (mods/nmnzTab.ts) still allow panning, so this
// brings the shortcut back for them, minus the zoom reset.

type GameSettings = {
  forbidRotating: boolean
  forbidZooming: boolean
}

// `/game/<token>`, optionally behind a locale prefix such as `/de`.
const GAME_PAGE = /^\/(?:[a-z]{2}(?:-[a-z]+)?\/)?game\/([^/]+)\/?$/i

const settingsByToken = new Map<string, Promise<GameSettings | null>>()

function fetchGameSettings(token: string) {
  let settings = settingsByToken.get(token)
  if (!settings) {
    settings = fetch(`/api/v3/games/${encodeURIComponent(token)}`)
      .then((response) => (response.ok ? (response.json() as Promise<GameSettings>) : null))
      .catch(() => null)
      .then((result) => {
        // Let the next key press retry instead of caching the failure.
        if (!result) settingsByToken.delete(token)
        return result
      })
    settingsByToken.set(token, settings)
  }
  return settings
}

function isTyping() {
  const active = document.activeElement
  return (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  )
}

let animating = false
let animationId = 0

/** Mirrors GeoGuessr's own animation, without touching the zoom. */
function faceNorth(panorama: google.maps.StreetViewPanorama) {
  const id = ++animationId
  const pov = panorama.getPov()
  const fromHeading = (((pov.heading ?? 0) % 360) + 360) % 360
  const fromPitch = pov.pitch ?? 0
  // Already facing north (or still turning there): look straight down instead.
  const lookDown = Math.min(fromHeading, 360 - fromHeading) < 0.01 || animating
  const toHeading = fromHeading > 180 ? 360 : 0
  const toPitch = lookDown ? -89 : fromPitch
  const duration = 4 * Math.max(Math.abs(toHeading - fromHeading), 100)

  let startTime: number | null = null
  const step = (time: number) => {
    if (id !== animationId) return
    startTime ??= time
    const progress = Math.min((time - startTime) / duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3)
    panorama.setPov({
      heading: fromHeading + (toHeading - fromHeading) * eased,
      pitch: fromPitch + (toPitch - fromPitch) * eased
    })
    if (progress < 1) requestAnimationFrame(step)
    else animating = false
  }

  animating = true
  requestAnimationFrame(step)
}

export function installFaceNorthShortcut(
  getPanorama: () => google.maps.StreetViewPanorama | undefined
) {
  const onKeyDown = async (event: KeyboardEvent) => {
    if (event.key?.toLowerCase() !== 'n' || event.ctrlKey || event.altKey || event.metaKey) return
    if (isTyping()) return

    const token = GAME_PAGE.exec(window.location.pathname)?.[1]
    const panorama = getPanorama()
    if (!token || !panorama) return

    // GeoGuessr handles every other game itself.
    const settings = await fetchGameSettings(token)
    if (!settings?.forbidZooming || settings.forbidRotating) return

    faceNorth(panorama)
  }

  window.addEventListener('keydown', onKeyDown)
  return () => window.removeEventListener('keydown', onKeyDown)
}
