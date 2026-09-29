/** Street View's useful field-of-view range tops out at zoom level 4. */
export function progressiveZoomLevel(normalZoom: number, elapsedMs: number, durationMs: number) {
  const startZoom = Math.max(4, normalZoom)
  const elapsed = Math.max(0, Math.min(durationMs, elapsedMs))
  const firstStepMs = Math.min(2000, durationMs / 3)
  const firstStepZoom = Math.max(normalZoom, startZoom - 1)

  if (elapsed <= firstStepMs) {
    return startZoom + (firstStepZoom - startZoom) * elapsed / firstStepMs
  }

  return firstStepZoom + (normalZoom - firstStepZoom) * (elapsed - firstStepMs) / (durationMs - firstStepMs)
}
