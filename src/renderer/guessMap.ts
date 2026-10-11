type MapLike = { getDiv: () => HTMLElement }
type Fiber = {
  return?: Fiber
  memoizedProps?: { map?: unknown }
  pendingProps?: { map?: unknown }
}

function isMap(value: unknown): value is MapLike {
  return !!value && typeof (value as MapLike).getDiv === 'function'
}

/** Resolve at plonk time: GeoGuessr can create the map before our constructor hook. */
export function findGuessMap<T extends MapLike>(
  canvas: HTMLElement,
  candidates: Iterable<T>
): T | undefined {
  const belongsToCanvas = (map: MapLike) => {
    const div = map.getDiv()
    return div.isConnected && (div === canvas || canvas.contains(div))
  }
  for (const map of candidates) {
    if (belongsToCanvas(map)) return map
  }
  // Use the component's map reference, without relying on Google Maps' private listener fields.
  let element: HTMLElement | null = canvas
  while (element) {
    const key = Object.keys(element).find((key) => key.startsWith('__reactFiber$'))
    let fiber = key ? (element as unknown as Record<string, Fiber>)[key] : undefined
    for (let depth = 0; fiber && depth < 40; depth++, fiber = fiber.return) {
      const map = fiber.memoizedProps?.map ?? fiber.pendingProps?.map
      if (isMap(map) && belongsToCanvas(map)) return map as T
    }
    element = element.parentElement
  }
  return undefined
}
