import { getLocalStorage, setLocalStorage } from './useLocalStorage'

let globalMap: google.maps.Map | undefined = undefined
const mapReady = hijackMap()

let guessMarkers: google.maps.marker.AdvancedMarkerElement[] = []
let polylines: google.maps.Polyline[] = []

let satelliteLayer: google.maps.Map | undefined = undefined
let satelliteMarker: google.maps.marker.AdvancedMarkerElement | undefined = undefined
const satelliteCanvas = document.createElement('div')
satelliteCanvas.id = 'satelliteCanvas'

async function loadMarkerLibrary() {
  return (await google.maps.importLibrary('marker')) as unknown as google.maps.MarkerLibrary
}

async function drawRoundResults(
  location: Location_,
  roundResults: RoundResult[],
  limit: number = 100
) {
  await mapReady
  const { AdvancedMarkerElement } = await loadMarkerLibrary()

  const map = globalMap

  const infoWindow = createInfoWindow()

  for (let i = roundResults.length - 1; i >= 0; i--) {
    const result = roundResults[i]
    const index = i
    if (index >= limit) continue

    const guessMarkerContent = createCustomGuessMarker(result.player.avatar, index)
    const guessMarker = new AdvancedMarkerElement({
      map,
      position: result.position,
      content: guessMarkerContent
    })

    guessMarkerContent.addEventListener('mouseover', () => {
      infoWindow.setContent(`
        ${result.player.flag ? `<span class="flag-icon" style="background-image: url(flag:${result.player.flag})"></span>` : ''}
        <span class="username" style="color:${result.player.color}">${result.player.username}</span><br>
        ${result.score}<br>
        ${parseDistance(result.distance)}<br/>
        ${result.streakCode ? `<span class="flag-icon" style="background-image: url(flag:${result.streakCode})"></span>` : ''} ${result.streakCode ? result.streakCode : ""}
      `)
      infoWindow.open(map, guessMarker)
    })
    guessMarkerContent.addEventListener('mouseout', () => {
      infoWindow.close()
    })

    guessMarkers.push(guessMarker)

    polylines.push(
      new google.maps.Polyline({
        path: [result.position, location],
        map,
        strokeColor: result.player.color,
        strokeWeight: 4,
        strokeOpacity: 0.6,
        geodesic: true
      })
    )
  }
}

async function drawPlayerResults(locations: Location_[], result: GameResultDisplay) {
  await mapReady
  const { AdvancedMarkerElement } = await loadMarkerLibrary()

  const map = globalMap

  clearMarkers()

  const infoWindow = createInfoWindow()

  result.guesses.forEach((guess, index) => {
    if (!guess) return

    const guessMarkerContent = createCustomGuessMarker(result.player.avatar)
    const guessMarker = new AdvancedMarkerElement({
      map,
      position: guess,
      content: guessMarkerContent
    })

    guessMarkerContent.addEventListener('mouseover', () => {
      infoWindow.setContent(`
				${result.player.flag ? `<span class="flag-icon" style="background-image: url(flag:${result.player.flag})"></span>` : ''}
        <span class="username" style="color:${result.player.color}">${result.player.username}</span><br>
        ${result.scores[index]}<br>
				${parseDistance(result.distances[index]!)}
			`)
      infoWindow.open(map, guessMarker)
    })
    guessMarkerContent.addEventListener('mouseout', () => {
      infoWindow.close()
    })
    guessMarkers.push(guessMarker)

    polylines.push(
      new google.maps.Polyline({
        path: [guess, locations[index]],
        map,
        strokeColor: result.player.color,
        strokeWeight: 4,
        strokeOpacity: 0.6,
        geodesic: true
      })
    )
  })
}

function focusOnGuess(location: LatLng) {
  if (!globalMap) return
  globalMap.setCenter(location)
  globalMap.setZoom(8)
}

function createInfoWindow() {
  return new google.maps.InfoWindow({
    pixelOffset: new google.maps.Size(0, 10)
  })
}

function createCustomGuessMarker(avatar: string | null, index?: number) {
  const markerEl = document.createElement('div')
  markerEl.className = 'custom-guess-marker'

  const avatarImg = document.createElement('img')
  avatarImg.src = avatar ?? 'asset:avatar-default.jpg'
  avatarImg.className = 'custom-guess-marker--avatar'
  markerEl.appendChild(avatarImg)

  if (index !== undefined) {
    const labelText = document.createElement('span')
    labelText.textContent = `${index + 1}`

    const labelSpan = document.createElement('span')
    labelSpan.className = 'custom-guess-marker--label'
    labelSpan.appendChild(labelText)

    markerEl.appendChild(labelSpan)
  }

  return markerEl
}

function clearMarkers() {
  for (const marker of guessMarkers) {
    marker.map = null
  }
  for (const line of polylines) {
    line.setMap(null)
  }
  guessMarkers = []
  polylines = []
}

async function showSatelliteMap(location: LatLng) {
  await mapReady
  const { AdvancedMarkerElement } = await loadMarkerLibrary()

  const satelliteMode = getLocalStorage('cg_satelliteMode__settings', { boundsLimit: 10 })

  if (!document.body.contains(satelliteCanvas)) {
    document.querySelector('[data-qa="panorama"] [aria-label="Map"]')?.append(satelliteCanvas)
  }
  satelliteCanvas.style.display = 'block'

  satelliteLayer ??= new google.maps.Map(satelliteCanvas, {
    fullscreenControl: false,
    mapTypeId: google.maps.MapTypeId.SATELLITE
  })

  satelliteLayer.setOptions({
    mapId: 'SATELLITE_LAYER',
    restriction: {
      latLngBounds: getBounds(location, satelliteMode.boundsLimit),
      strictBounds: true
    }
  })

  satelliteLayer.setCenter(location)
  satelliteLayer.setZoom(15)

  if (satelliteMarker) satelliteMarker.map = null

  satelliteMarker = new AdvancedMarkerElement({
    position: location,
    map: satelliteLayer
  })
}

async function hideSatelliteMap() {
  await mapReady
  satelliteCanvas.style.display = 'none'
}

function centerSatelliteView(location: LatLng) {
  if (!satelliteLayer) return
  satelliteLayer.setCenter(location)
}

function getBounds(location: LatLng, limitInKm: number) {
  const meters = (limitInKm * 1000) / 2
  const earth = 6371.071
  const pi = Math.PI
  const m = 1 / (((2 * pi) / 360) * earth) / 1000

  const north = location.lat + meters * m
  const south = location.lat - meters * m
  const west = location.lng - (meters * m) / Math.cos(location.lat * (pi / 180))
  const east = location.lng + (meters * m) / Math.cos(location.lat * (pi / 180))

  return { north, south, west, east }
}

function parseDistance(distance: number) {
  return distance >= 1 ? distance.toFixed(1) + 'km' : Math.floor(distance * 1000) + 'm'
}

async function hijackMap() {
  const MAPS_API_URL = 'https://maps.googleapis.com/maps/api/js?'
  const MAPS_SCRIPT_SELECTOR = `script[src^="${MAPS_API_URL}"]`
  await new Promise((resolve) => {
    let bodyDone = false
    let headDone = false

    function checkBodyDone() {
      if (!bodyDone && document.body) {
        scriptObserver.observe(document.body, { childList: true })
        bodyDone = true
      }
    }
    function checkHeadDone() {
      if (!headDone && document.head) {
        scriptObserver.observe(document.head, { childList: true })
        headDone = true
      }
    }

    /**
     * Check if `element` is a Google Maps script tag and resolve the outer Promise if so.
     */
    function checkMapsScript(element: Element) {
      if (element.matches(MAPS_SCRIPT_SELECTOR)) {
        const onload = () => {
          pageObserver.disconnect()
          scriptObserver.disconnect()
          resolve(undefined)
        }
        // It may already be loaded :O
        if (typeof google !== 'undefined' && google?.maps?.Map) {
          onload()
        } else {
          element.addEventListener('load', onload)
        }
      }
    }

    const scriptObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const tmp of mutation.addedNodes) {
          if (tmp.nodeType === Node.ELEMENT_NODE) {
            checkMapsScript(tmp as Element)
          }
        }
      }
    })
    const pageObserver = new MutationObserver((_, observer) => {
      checkBodyDone()
      checkHeadDone()
      if (headDone && bodyDone) {
        observer.disconnect()
      }
    })

    pageObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    })

    // Do an initial check, we may be running in a fully loaded game already.
    checkBodyDone()
    checkHeadDone()
    const existingTag: HTMLElement | null = document.querySelector(MAPS_SCRIPT_SELECTOR)
    if (existingTag) checkMapsScript(existingTag)
  })

  await new Promise<void>((resolve, reject) => {
    const google = window.google
    const isGamePage = () => /^\/([a-zA-Z-]{2,5}\/)?(results|game)\//.test(location.pathname)

    async function onMapUpdate(map: google.maps.Map) {
      try {
        if (!isGamePage()) return
        globalMap = map
        resolve()
      } catch (err) {
        console.error('GeoguessrHijackMap Error:', err)
        reject(err)
      }
    }

    const mapInstances: google.maps.Map[] = []

    function forceContextLoss(div: HTMLElement) {
      try {
        const canvas = div.querySelector('canvas')
        if (!canvas) return
        const gl = canvas.getContext('webgl') || canvas.getContext('webgl2')
        if (gl) {
          const ext = gl.getExtension('WEBGL_lose_context')
          if (ext) {
            console.log('[ChatGuessr] Forcing WebGL context loss for old map instance')
            ext.loseContext()
          }
        }
      } catch (e) {
        console.error('[ChatGuessr] Error forcing context loss:', e)
      }
    }

    google.maps.Map = class extends google.maps.Map {
      constructor(mapDiv: HTMLElement, opts: google.maps.MapOptions) {
        // Cleanup old instances
        while (mapInstances.length > 0) {
          const oldMap = mapInstances.shift()
          if (oldMap) {
            const div = oldMap.getDiv()
            if (div) forceContextLoss(div)
          }
        }

        opts.mapId = opts.mapId || 'DEMO_MAP_ID'
        super(mapDiv, opts)
        mapInstances.push(this)


        // https://c.tile.opentopomap.org/2/2/3.png
        const openTopoMapType = new google.maps.ImageMapType({
          getTileUrl: function (coord, zoom) {
            return 'https://c.tile.opentopomap.org/' + zoom + '/' + coord.x + '/' + coord.y + '.png'
          },
          tileSize: new google.maps.Size(256, 256),
          name: 'OTM',
          maxZoom: 18
        })
        this.mapTypes.set('opentopomap', openTopoMapType)

        const osmMapType = new google.maps.ImageMapType({
          getTileUrl: function (coord, zoom) {
            return 'https://tile.openstreetmap.org/' + zoom + '/' + coord.x + '/' + coord.y + '.png'
          },
          tileSize: new google.maps.Size(256, 256),
          name: 'OSM',
          maxZoom: 18
        })
        this.mapTypes.set('osm', osmMapType)

        this.addListener('idle', () => {
          if (globalMap == null) {
            onMapUpdate(this)
          }
        })
        this.addListener('maptypeid_changed', () => {
          // Save the map type ID so we can prevent GeoGuessr from resetting it
          setLocalStorage('cg_MapTypeId', this.getMapTypeId())
        })
      }


      setOptions(opts: google.maps.MapOptions) {
        // GeoGuessr's `setOptions` calls always include `backgroundColor`
        // so this is how we can distinguish between theirs and ours
        if (opts.backgroundColor) {
          opts.mapTypeId = getLocalStorage('cg_MapTypeId', opts.mapTypeId)
          opts.mapTypeControl = true
          opts.mapTypeControlOptions = {
            mapTypeIds: [
              google.maps.MapTypeId.ROADMAP,
              google.maps.MapTypeId.TERRAIN,
              google.maps.MapTypeId.SATELLITE,
              google.maps.MapTypeId.HYBRID,
              'osm',
              'opentopomap'
            ],
            style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
            position: google.maps.ControlPosition.TOP_RIGHT
          }
        }
        super.setOptions(opts)
      }
    }
  })
}

export const rendererApi = {
  drawRoundResults,
  drawPlayerResults,
  focusOnGuess,
  clearMarkers,
  showSatelliteMap,
  hideSatelliteMap,
  centerSatelliteView
}