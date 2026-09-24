const PANORAMA_SELECTOR = '[data-qa="panorama"]'
// Results screen and loading spinner: the panorama underneath is not the round's (yet).
const NOT_IN_ROUND_SELECTOR =
  '[class^="result-layout_root__"], [class^="fullscreen-spinner_root__"]'

const POLL_INTERVAL_MS = 500
// High-resolution tiles keep streaming in for a while after the first frame.
const SETTLE_MS = 2500
// A panorama that never lines up with the round's coordinates is trusted after this long.
const POSITION_GRACE_MS = 8000
const BLANK_TIMEOUT_MS = 30000
const SAME_PLACE_KM = 1

const MAX_IMAGE_WIDTH = 1280
const JPEG_QUALITY = 0.85

export type PanoramaCapture = AiDescriptionRequest

type CaptureOptions = {
  /** The Street View the round is played in, if it could be hooked. */
  streetView: () => google.maps.StreetViewPanorama | undefined
  location: Location_
  isCancelled: () => boolean
}

export function findPanoramaRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>(PANORAMA_SELECTOR)
}

/**
 * The canvas Street View draws into. With the extenssr post-processing hooked in, this holds the
 * filtered output (pixelate, toon, …), i.e. exactly what the player would have seen.
 */
function findPanoramaCanvas(): HTMLCanvasElement | null {
  const root = findPanoramaRoot()
  if (!root) return null
  const sceneCanvas = root.querySelector<HTMLCanvasElement>('canvas.widget-scene-canvas')
  if (sceneCanvas) return sceneCanvas

  let largest: HTMLCanvasElement | null = null
  for (const canvas of root.querySelectorAll('canvas')) {
    if (!largest || canvas.width * canvas.height > largest.width * largest.height) largest = canvas
  }
  return largest
}

/** A panorama that is still loading, or a canvas we can't read, is one flat colour. */
function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  if (canvas.width === 0 || canvas.height === 0) return true
  try {
    // OffscreenCanvas, because extenssr hooks document.createElement('canvas').
    const sample = new OffscreenCanvas(32, 18)
    const ctx = sample.getContext('2d', { willReadFrequently: true })
    if (!ctx) return true
    ctx.drawImage(canvas, 0, 0, sample.width, sample.height)
    const { data } = ctx.getImageData(0, 0, sample.width, sample.height)

    let min = 255
    let max = 0
    for (let i = 0; i < data.length; i += 4) {
      const luminance = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
      if (luminance < min) min = luminance
      if (luminance > max) max = luminance
    }
    return max - min < 12
  } catch {
    return true
  }
}

async function encodeCanvas(canvas: HTMLCanvasElement): Promise<string> {
  const scale = Math.min(1, MAX_IMAGE_WIDTH / canvas.width)
  const image = new OffscreenCanvas(
    Math.round(canvas.width * scale),
    Math.round(canvas.height * scale)
  )
  image.getContext('2d')!.drawImage(canvas, 0, 0, image.width, image.height)
  const blob = await image.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function distanceKm(a: LatLng, b: LatLng) {
  const toRad = Math.PI / 180
  const dLat = (b.lat - a.lat) * toRad
  const dLng = (b.lng - a.lng) * toRad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

function isNear(position: google.maps.LatLng | null | undefined, location: LatLng) {
  if (!position) return false
  return distanceKm({ lat: position.lat(), lng: position.lng() }, location) < SAME_PLACE_KM
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Waits until the round's panorama is on screen and has finished sharpening, then grabs it.
 * Resolves `null` when cancelled; throws when the canvas can't be read.
 */
export async function captureRoundPanorama({
  streetView,
  location,
  isCancelled
}: CaptureOptions): Promise<PanoramaCapture | null> {
  let shownSince: number | null = null
  let shownPano: string | undefined
  let blankSince: number | null = null

  for (;;) {
    await sleep(POLL_INTERVAL_MS)
    if (isCancelled()) return null

    const now = Date.now()
    const canvas = document.querySelector(NOT_IN_ROUND_SELECTOR) ? null : findPanoramaCanvas()
    if (!canvas) {
      shownSince = blankSince = null
      continue
    }
    if (isCanvasBlank(canvas)) {
      shownSince = null
      blankSince ??= now
      if (now - blankSince > BLANK_TIMEOUT_MS)
        throw new Error('Could not read the Street View image.')
      continue
    }
    blankSince = null

    // Restart the clock whenever Street View switches panoramas.
    const sv = streetView()
    const pano = sv?.getPano()
    if (shownSince === null || pano !== shownPano) {
      shownSince = now
      shownPano = pano
    }
    const shownFor = now - shownSince

    // Right after "next round" the previous panorama can still be up; only trust one that is at
    // the round's location, or that has stayed on screen long enough that it must be this round's.
    const atLocation = isNear(sv?.getPosition(), location)
    if (shownFor < SETTLE_MS || (!atLocation && shownFor < POSITION_GRACE_MS)) continue

    const pov = sv?.getPov()
    return {
      image: await encodeCanvas(canvas),
      heading: pov?.heading ?? location.heading,
      pitch: pov?.pitch ?? location.pitch
    }
  }
}
