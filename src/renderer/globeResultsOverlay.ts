const GLOBE_OVERLAY_SELECTOR = '[data-geoguessr-globe="overlay"]'
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const MAX_ARC_STEP_DEGREES = 3
const MAX_ARC_STEPS = 96
const VISIBILITY_SEARCH_STEPS = 8
const FOCUS_ZOOM = 8

export type GlobeResultOverlayItem = {
  position: LatLng
  lineTo?: LatLng
  lineColor?: string
  createMarker: () => HTMLElement
  createTooltip?: () => HTMLElement
}

type GlobeProjection = {
  x: number
  y: number
  visible: boolean
}

type GlobeView = {
  center: LatLng
  zoom: number
}

type GlobeApi = {
  readonly domElement: HTMLCanvasElement
  readonly view?: GlobeView
  projectCoordinate(position: LatLng): GlobeProjection | null
  on?(event: 'viewchange', listener: () => void): (() => void) | void
  flyTo?(position: LatLng, zoom?: number, durationMs?: number): void
  setView?(
    view: { center: LatLng; zoom?: number },
    options?: { animate?: boolean; durationMs?: number }
  ): void
}

type GlobeBridge = {
  readonly status?: {
    overlayKind?: string | null
  }
  readonly globe?: GlobeApi | null
}

type GlobeWindow = Window & {
  __geoguessrGlobe?: GlobeBridge
}

type ActiveGlobe = {
  globe: GlobeApi
  root: HTMLElement
}

type StoredItem = Omit<GlobeResultOverlayItem, 'position' | 'lineTo'> & {
  position: LatLng
  lineTo?: LatLng
}

type RenderedItem = {
  item: StoredItem
  markerContainer: HTMLDivElement
  line: SVGPathElement | null
  lineSamples: LatLng[]
}

type ProjectionMetrics = {
  width: number
  height: number
  offsetX: number
  offsetY: number
  scaleX: number
  scaleY: number
}

type Vector3 = {
  x: number
  y: number
  z: number
}

function isValidPosition(position: LatLng | undefined): position is LatLng {
  return (
    position !== undefined &&
    Number.isFinite(position.lat) &&
    Number.isFinite(position.lng) &&
    position.lat >= -90 &&
    position.lat <= 90 &&
    position.lng >= -180 &&
    position.lng <= 180
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function toUnitVector(position: LatLng): Vector3 {
  const latitude = (position.lat * Math.PI) / 180
  const longitude = (position.lng * Math.PI) / 180
  const latitudeRadius = Math.cos(latitude)

  return {
    x: latitudeRadius * Math.cos(longitude),
    y: latitudeRadius * Math.sin(longitude),
    z: Math.sin(latitude)
  }
}

function normalizeVector(vector: Vector3): Vector3 {
  const length = Math.hypot(vector.x, vector.y, vector.z)
  if (length === 0) return { x: 1, y: 0, z: 0 }

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  }
}

function crossProduct(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x
  }
}

function vectorToPosition(vector: Vector3): LatLng {
  const normalized = normalizeVector(vector)

  return {
    lat: (Math.asin(clamp(normalized.z, -1, 1)) * 180) / Math.PI,
    lng: (Math.atan2(normalized.y, normalized.x) * 180) / Math.PI
  }
}

function interpolateGreatCircle(from: LatLng, to: LatLng, progress: number): LatLng {
  const start = toUnitVector(from)
  const end = toUnitVector(to)
  const dot = clamp(start.x * end.x + start.y * end.y + start.z * end.z, -1, 1)
  const angle = Math.acos(dot)

  if (angle < 1e-8) return { ...from }

  let interpolated: Vector3
  const sinAngle = Math.sin(angle)

  if (Math.abs(sinAngle) > 1e-8) {
    const fromWeight = Math.sin((1 - progress) * angle) / sinAngle
    const toWeight = Math.sin(progress * angle) / sinAngle
    interpolated = {
      x: start.x * fromWeight + end.x * toWeight,
      y: start.y * fromWeight + end.y * toWeight,
      z: start.z * fromWeight + end.z * toWeight
    }
  } else {
    const reference = Math.abs(start.x) < 0.8 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 }
    const perpendicular = normalizeVector(crossProduct(start, reference))
    interpolated = {
      x: start.x * Math.cos(Math.PI * progress) + perpendicular.x * Math.sin(Math.PI * progress),
      y: start.y * Math.cos(Math.PI * progress) + perpendicular.y * Math.sin(Math.PI * progress),
      z: start.z * Math.cos(Math.PI * progress) + perpendicular.z * Math.sin(Math.PI * progress)
    }
  }

  return vectorToPosition(interpolated)
}

function sampleGreatCircle(from: LatLng, to: LatLng): LatLng[] {
  if (!isValidPosition(from) || !isValidPosition(to)) return []

  const start = toUnitVector(from)
  const end = toUnitVector(to)
  const angle = Math.acos(clamp(start.x * end.x + start.y * end.y + start.z * end.z, -1, 1))
  const angleDegrees = (angle * 180) / Math.PI
  const steps = Math.max(1, Math.min(MAX_ARC_STEPS, Math.ceil(angleDegrees / MAX_ARC_STEP_DEGREES)))

  return Array.from({ length: steps + 1 }, (_, index) =>
    interpolateGreatCircle(from, to, index / steps)
  )
}

function formatPathNumber(value: number) {
  return String(Math.round(value * 100) / 100)
}

export class GlobeResultsOverlay {
  private items: StoredItem[] = []
  private renderedItems: RenderedItem[] = []
  private activeGlobe: ActiveGlobe | null = null
  private layer: HTMLDivElement | null = null
  private svgLayer: SVGSVGElement | null = null
  private markerLayer: HTMLDivElement | null = null
  private domObserver: MutationObserver | null = null
  private resizeObserver: ResizeObserver | null = null
  private viewUnsubscribe: (() => void) | null = null
  private animationFrame: number | null = null

  private readonly handleWindowResize = () => this.scheduleUpdate()
  private readonly handleDomMutation = () => {
    if (this.isCurrentGlobe(this.getActiveGlobe())) return
    this.scheduleUpdate()
  }

  setItems(items: readonly GlobeResultOverlayItem[]) {
    this.detachOverlay()
    this.items = items.map((item) => ({
      ...item,
      position: { ...item.position },
      ...(item.lineTo ? { lineTo: { ...item.lineTo } } : {})
    }))

    if (this.items.length === 0) {
      this.stopWatching()
      this.cancelUpdate()
      return
    }

    this.startWatching()
    this.scheduleUpdate()
  }

  clear() {
    this.items = []
    this.detachOverlay()
    this.stopWatching()
    this.cancelUpdate()
  }

  focus(position: LatLng): boolean {
    if (!isValidPosition(position)) return false

    this.reconcileGlobe()
    const globe = this.activeGlobe?.globe
    if (!globe) return false

    try {
      if (typeof globe.flyTo === 'function') {
        globe.flyTo({ ...position }, FOCUS_ZOOM, 500)
      } else if (typeof globe.setView === 'function') {
        globe.setView(
          { center: { ...position }, zoom: FOCUS_ZOOM },
          { animate: true, durationMs: 500 }
        )
      } else {
        return false
      }
    } catch {
      return false
    }

    this.scheduleUpdate()
    return true
  }

  private startWatching() {
    if (this.domObserver) return

    this.domObserver = new MutationObserver(this.handleDomMutation)
    this.domObserver.observe(document, { childList: true, subtree: true })
  }

  private stopWatching() {
    this.domObserver?.disconnect()
    this.domObserver = null
  }

  private scheduleUpdate() {
    if (this.animationFrame !== null || this.items.length === 0) return

    this.animationFrame = window.requestAnimationFrame(() => {
      this.animationFrame = null
      this.reconcileGlobe()
      this.render()
    })
  }

  private cancelUpdate() {
    if (this.animationFrame === null) return
    window.cancelAnimationFrame(this.animationFrame)
    this.animationFrame = null
  }

  private getActiveGlobe(): ActiveGlobe | null {
    try {
      const bridge = (window as GlobeWindow).__geoguessrGlobe
      if (bridge?.status?.overlayKind !== 'result') return null

      const globe = bridge.globe
      if (!globe || typeof globe.projectCoordinate !== 'function') return null

      const canvas = globe.domElement
      if (!(canvas instanceof HTMLCanvasElement) || !canvas.isConnected) return null

      const root = canvas.closest(GLOBE_OVERLAY_SELECTOR)
      if (!(root instanceof HTMLElement) || !root.isConnected) return null

      return { globe, root }
    } catch {
      return null
    }
  }

  private reconcileGlobe() {
    const nextGlobe = this.getActiveGlobe()

    if (!nextGlobe) {
      this.detachOverlay()
      return
    }

    if (this.isCurrentGlobe(nextGlobe)) return

    this.detachOverlay()
    this.attachOverlay(nextGlobe)
  }

  private isCurrentGlobe(candidate: ActiveGlobe | null) {
    if (!candidate) return this.activeGlobe === null && this.layer === null
    return (
      this.activeGlobe?.globe === candidate.globe &&
      this.activeGlobe.root === candidate.root &&
      this.layer?.parentElement === candidate.root
    )
  }

  private attachOverlay(activeGlobe: ActiveGlobe) {
    const ownerDocument = activeGlobe.root.ownerDocument
    const layer = ownerDocument.createElement('div')
    const svgLayer = ownerDocument.createElementNS(SVG_NAMESPACE, 'svg')
    const markerLayer = ownerDocument.createElement('div')

    layer.dataset.chatguessrGlobeResultsOverlay = 'true'
    Object.assign(layer.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '1',
      overflow: 'hidden',
      pointerEvents: 'none'
    })

    svgLayer.setAttribute('aria-hidden', 'true')
    Object.assign(svgLayer.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      pointerEvents: 'none'
    })

    Object.assign(markerLayer.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none'
    })

    layer.append(svgLayer, markerLayer)
    activeGlobe.root.appendChild(layer)

    this.activeGlobe = activeGlobe
    this.layer = layer
    this.svgLayer = svgLayer
    this.markerLayer = markerLayer
    this.renderedItems = this.items
      .map((item) => this.createRenderedItem(item))
      .filter((item): item is RenderedItem => item !== null)

    try {
      const unsubscribe = activeGlobe.globe.on?.('viewchange', () => this.scheduleUpdate())
      this.viewUnsubscribe = typeof unsubscribe === 'function' ? unsubscribe : null
    } catch {
      this.viewUnsubscribe = null
    }

    if (typeof ResizeObserver !== 'undefined') {
      try {
        this.resizeObserver = new ResizeObserver(() => this.scheduleUpdate())
        this.resizeObserver.observe(activeGlobe.root)
        this.resizeObserver.observe(activeGlobe.globe.domElement)
      } catch {
        this.resizeObserver?.disconnect()
        this.resizeObserver = null
      }
    }

    window.addEventListener('resize', this.handleWindowResize)
  }

  private createRenderedItem(item: StoredItem): RenderedItem | null {
    const { layer, markerLayer, svgLayer } = this
    if (!layer || !markerLayer || !svgLayer) return null

    let marker: HTMLElement
    let tooltip: HTMLElement | null = null
    try {
      marker = item.createMarker()
      tooltip = item.createTooltip?.() ?? null
    } catch {
      return null
    }
    if (!(marker instanceof HTMLElement) || (tooltip && !(tooltip instanceof HTMLElement))) {
      return null
    }

    const markerContainer = layer.ownerDocument.createElement('div')
    markerContainer.dataset.chatguessrGlobeMarker = 'true'
    Object.assign(markerContainer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      visibility: 'hidden',
      whiteSpace: 'nowrap',
      pointerEvents: 'auto',
      willChange: 'transform'
    })

    try {
      markerContainer.append(marker)
      if (tooltip && tooltip !== marker && !marker.contains(tooltip)) {
        markerContainer.append(tooltip)
      }
      markerLayer.appendChild(markerContainer)
    } catch {
      markerContainer.remove()
      return null
    }

    let line: SVGPathElement | null = null
    const lineSamples = item.lineTo ? sampleGreatCircle(item.position, item.lineTo) : []

    if (lineSamples.length > 1) {
      line = layer.ownerDocument.createElementNS(SVG_NAMESPACE, 'path')
      line.setAttribute('fill', 'none')
      line.setAttribute('stroke', item.lineColor ?? '#ffffff')
      line.setAttribute('stroke-width', '4')
      line.setAttribute('stroke-linecap', 'round')
      line.setAttribute('stroke-linejoin', 'round')
      line.setAttribute('stroke-opacity', '0.6')
      line.setAttribute('vector-effect', 'non-scaling-stroke')
      svgLayer.appendChild(line)
    }

    return { item, markerContainer, line, lineSamples }
  }

  private detachOverlay() {
    try {
      this.viewUnsubscribe?.()
    } catch {
      // The DOM layer must still be released if a foreign unsubscribe hook fails.
    }
    this.viewUnsubscribe = null

    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    window.removeEventListener('resize', this.handleWindowResize)

    this.renderedItems = []
    this.layer?.remove()
    this.layer = null
    this.svgLayer = null
    this.markerLayer = null
    this.activeGlobe = null
  }

  private getProjectionMetrics(): ProjectionMetrics | null {
    const { activeGlobe, layer } = this
    if (!activeGlobe || !layer) return null

    const canvas = activeGlobe.globe.domElement
    const layerRect = layer.getBoundingClientRect()
    const canvasRect = canvas.getBoundingClientRect()
    const width = layer.clientWidth
    const height = layer.clientHeight

    if (
      width <= 0 ||
      height <= 0 ||
      layerRect.width <= 0 ||
      layerRect.height <= 0 ||
      canvasRect.width <= 0 ||
      canvasRect.height <= 0
    ) {
      return null
    }

    const screenToLayerX = width / layerRect.width
    const screenToLayerY = height / layerRect.height
    const canvasWidth = Math.max(1, canvas.clientWidth)
    const canvasHeight = Math.max(1, canvas.clientHeight)

    return {
      width,
      height,
      offsetX: (canvasRect.left - layerRect.left) * screenToLayerX,
      offsetY: (canvasRect.top - layerRect.top) * screenToLayerY,
      scaleX: (canvasRect.width / canvasWidth) * screenToLayerX,
      scaleY: (canvasRect.height / canvasHeight) * screenToLayerY
    }
  }

  private project(position: LatLng, metrics: ProjectionMetrics): GlobeProjection | null {
    const globe = this.activeGlobe?.globe
    if (!globe || !isValidPosition(position)) return null

    try {
      const projection = globe.projectCoordinate(position)
      if (!projection || !Number.isFinite(projection.x) || !Number.isFinite(projection.y)) {
        return null
      }

      const x = metrics.offsetX + projection.x * metrics.scaleX
      const y = metrics.offsetY + projection.y * metrics.scaleY

      return {
        x,
        y,
        visible: projection.visible && x >= 0 && x <= metrics.width && y >= 0 && y <= metrics.height
      }
    } catch {
      return null
    }
  }

  private findVisibilityBoundary(
    from: LatLng,
    fromProjection: GlobeProjection,
    to: LatLng,
    toProjection: GlobeProjection,
    metrics: ProjectionMetrics
  ): GlobeProjection | null {
    let visiblePosition = fromProjection.visible ? from : to
    let hiddenPosition = fromProjection.visible ? to : from
    let visibleProjection = fromProjection.visible ? fromProjection : toProjection

    for (let index = 0; index < VISIBILITY_SEARCH_STEPS; index += 1) {
      const midpoint = interpolateGreatCircle(visiblePosition, hiddenPosition, 0.5)
      const midpointProjection = this.project(midpoint, metrics)
      if (!midpointProjection) break

      if (midpointProjection.visible) {
        visiblePosition = midpoint
        visibleProjection = midpointProjection
      } else {
        hiddenPosition = midpoint
      }
    }

    return visibleProjection
  }

  private buildLinePath(samples: readonly LatLng[], metrics: ProjectionMetrics) {
    if (samples.length < 2) return ''

    const commands: string[] = []
    let previousPosition = samples[0]
    let previousProjection = this.project(previousPosition, metrics)
    let pathOpen = false

    for (let index = 1; index < samples.length; index += 1) {
      const position = samples[index]
      const projection = this.project(position, metrics)

      if (!previousProjection || !projection) {
        pathOpen = false
        previousPosition = position
        previousProjection = projection
        continue
      }

      if (previousProjection.visible && projection.visible) {
        if (!pathOpen) {
          commands.push(
            `M${formatPathNumber(previousProjection.x)} ${formatPathNumber(previousProjection.y)}`
          )
        }
        commands.push(`L${formatPathNumber(projection.x)} ${formatPathNumber(projection.y)}`)
        pathOpen = true
      } else if (previousProjection.visible) {
        if (!pathOpen) {
          commands.push(
            `M${formatPathNumber(previousProjection.x)} ${formatPathNumber(previousProjection.y)}`
          )
        }
        const boundary = this.findVisibilityBoundary(
          previousPosition,
          previousProjection,
          position,
          projection,
          metrics
        )
        if (boundary) {
          commands.push(`L${formatPathNumber(boundary.x)} ${formatPathNumber(boundary.y)}`)
        }
        pathOpen = false
      } else if (projection.visible) {
        const boundary = this.findVisibilityBoundary(
          previousPosition,
          previousProjection,
          position,
          projection,
          metrics
        )
        const start = boundary ?? projection
        commands.push(`M${formatPathNumber(start.x)} ${formatPathNumber(start.y)}`)
        commands.push(`L${formatPathNumber(projection.x)} ${formatPathNumber(projection.y)}`)
        pathOpen = true
      } else {
        pathOpen = false
      }

      previousPosition = position
      previousProjection = projection
    }

    return commands.join(' ')
  }

  private render() {
    const { layer, svgLayer } = this
    if (!layer || !svgLayer || !this.activeGlobe) return

    const metrics = this.getProjectionMetrics()
    if (!metrics) {
      layer.style.visibility = 'hidden'
      return
    }

    layer.style.visibility = 'visible'
    svgLayer.setAttribute('viewBox', `0 0 ${metrics.width} ${metrics.height}`)

    for (const renderedItem of this.renderedItems) {
      const projection = this.project(renderedItem.item.position, metrics)
      renderedItem.markerContainer.style.visibility = projection?.visible ? 'visible' : 'hidden'

      if (projection?.visible) {
        renderedItem.markerContainer.style.transform =
          `translate3d(${formatPathNumber(projection.x)}px, ` +
          `${formatPathNumber(projection.y)}px, 0) translate(-50%, -50%)`
      }

      if (renderedItem.line) {
        const path = this.buildLinePath(renderedItem.lineSamples, metrics)
        renderedItem.line.setAttribute('d', path)
        renderedItem.line.style.visibility = path ? 'visible' : 'hidden'
      }
    }
  }
}

export const globeResultsOverlay = new GlobeResultsOverlay()
