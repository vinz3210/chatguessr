import { getLocalStorage, setLocalStorage } from '../useLocalStorage'

declare global {
  interface Window {
    toggleGuessGuessMode: (el: HTMLInputElement) => void
  }
}

;(function guessGuessMode() {
  const settings = getLocalStorage('cg_guessGuessMode__settings', {
    enabled: false
  })

  // Settings UI Logic
  window.toggleGuessGuessMode = (el) => {
    settings.enabled = el.checked
    setLocalStorage('cg_guessGuessMode__settings', settings)
    if (settings.enabled) {
      if (isRoundActive()) showMapOverlay()
    } else {
      hideMapOverlay()
    }
  }

  const guiHTML = `
    <div class="section_sizeMedium__CuXRP">
      <div class="bars_root__tryg2 bars_center__kXp6T">
        <div class="bars_before__S32L5"></div>
        <span class="bars_content__Nw_TD"><h3>Guess Guess Mode</h3></span>
        <div class="bars_after__50_BW"></div>
      </div>
    </div>
    <div class="start-standard-game_settings__x94PU">
      <div style="display: flex; justify-content: space-between">
        <div style="display: flex; align-items: center">
            <span class="game-options_optionLabel__Vk5xN" style="margin: 0; padding-right: 6px">Enabled</span>
            <input
                type="checkbox"
                id="enableGuessGuessMode"
                onclick="toggleGuessGuessMode(this)"
                class="toggle_toggle__qfXpL"
            />
        </div>
      </div>
    </div>
  `

  const checkInsertGui = () => {
    if (
      document.querySelector('[class^="radio-box_root__"]') &&
      document.getElementById('enableGuessGuessMode') === null
    ) {
      document
        .querySelector('[class^="section_sectionMedium__"]')
        ?.insertAdjacentHTML('beforeend', guiHTML)

      if (settings.enabled) {
        ;(document.getElementById('enableGuessGuessMode') as HTMLInputElement).checked = true
      }
    }
  }

  const observer = new MutationObserver(() => {
    checkInsertGui()
  })

  observer.observe(document.body, {
    subtree: true,
    childList: true
  })

  // Map Overlay Logic
  let mapOverlay: HTMLElement | null = null
  let mapInstance: google.maps.Map | null = null
  let markers: google.maps.marker.AdvancedMarkerElement[] = []
  let isPanoramaVisible = false
  let togglePanoBtn: HTMLButtonElement | null = null

  async function loadMarkerLibrary() {
    return (await google.maps.importLibrary('marker')) as unknown as google.maps.MarkerLibrary
  }

  function createCustomGuessMarker(avatar: string | null) {
    const markerEl = document.createElement('div')
    markerEl.className = 'custom-guess-marker'

    const avatarImg = document.createElement('img')
    avatarImg.src = avatar ?? 'asset:avatar-default.jpg'
    avatarImg.className = 'custom-guess-marker--avatar'
    markerEl.appendChild(avatarImg)

    return markerEl
  }

  function createMapOverlay() {
    if (document.getElementById('guess-guess-map-overlay')) return

    const container = document.createElement('div')
    container.id = 'guess-guess-map-overlay'
    container.style.position = 'absolute'
    container.style.top = '0'
    container.style.left = '0'
    container.style.width = '100%'
    container.style.height = '100%'
    container.style.zIndex = '10' // Above panorama
    container.style.display = 'none'

    // Map Div
    const mapDiv = document.createElement('div')
    mapDiv.style.width = '100%'
    mapDiv.style.height = '100%'
    container.appendChild(mapDiv)

    // Toggle Panorama Button
    const btn = document.createElement('button')
    btn.textContent = 'Show Panorama'
    btn.style.position = 'absolute'
    btn.style.top = '10px'
    btn.style.left = '50%'
    btn.style.transform = 'translateX(-50%)'
    btn.style.zIndex = '100'

    // Styling
    btn.style.padding = '0.5rem 1rem'
    btn.style.background = 'rgba(0, 0, 0, 0.6)'
    btn.style.border = '1px solid rgba(255, 255, 255, 0.4)'
    btn.style.borderRadius = '4px'
    btn.style.color = 'white'
    btn.style.cursor = 'pointer'
    btn.style.fontSize = '14px'
    btn.style.fontWeight = 'bold'

    btn.onclick = () => {
      isPanoramaVisible = !isPanoramaVisible
      if (isPanoramaVisible) {
        mapDiv.style.visibility = 'hidden'
        container.style.pointerEvents = 'none'
        btn.style.pointerEvents = 'auto'
        btn.textContent = 'Show Map Overlay'
      } else {
        mapDiv.style.visibility = 'visible'
        container.style.pointerEvents = 'auto'
        btn.textContent = 'Show Panorama'
      }
    }
    togglePanoBtn = btn
    container.appendChild(btn)

    // Insert into DOM
    const panoramaContainer = document.querySelector('[data-qa="panorama"]')
    if (panoramaContainer) {
      panoramaContainer.appendChild(container)
    } else {
      document.body.appendChild(container)
    }

    mapOverlay = container

    initMap(mapDiv)
  }

  async function initMap(element: HTMLElement) {
    if (!window.google || !window.google.maps) {
        setTimeout(() => initMap(element), 500)
        return
    }

    await google.maps.importLibrary('maps')

    // Use DEMO_MAP_ID as seen in rendererApi.ts hijackMap function
    // This seems to be the default fallback used by the application
    const mapId = 'DEMO_MAP_ID'

    mapInstance = new google.maps.Map(element, {
      center: { lat: 0, lng: 0 },
      zoom: 2,
      mapTypeId: 'roadmap',
      disableDefaultUI: true,
      clickableIcons: false,
      mapId: mapId
    })
  }

  function showMapOverlay() {
    if (!mapOverlay) createMapOverlay()
    if (mapOverlay) {
        mapOverlay.style.display = 'block'
        isPanoramaVisible = false
        if (togglePanoBtn) togglePanoBtn.textContent = 'Show Panorama'
        if (mapOverlay.firstChild) (mapOverlay.firstChild as HTMLElement).style.visibility = 'visible'
        mapOverlay.style.pointerEvents = 'auto'
    }
  }

  function hideMapOverlay() {
    if (mapOverlay) {
      mapOverlay.style.display = 'none'
    }
  }

  function clearMarkers() {
    markers.forEach(m => m.map = null)
    markers = []
  }

  async function addGuessMarker(guess: any) {
    if (!mapInstance) return
    if (!guess || !guess.lat || !guess.lng) return

    try {
      const { AdvancedMarkerElement } = await loadMarkerLibrary()

      const markerContent = createCustomGuessMarker(guess.player?.avatar)

      const marker = new AdvancedMarkerElement({
        map: mapInstance,
        position: { lat: guess.lat, lng: guess.lng },
        content: markerContent,
        title: guess.player?.username || 'Player'
      })

      markers.push(marker)
    } catch (error) {
      console.error('Failed to add advanced marker:', error)
      // Fallback to legacy marker if AdvancedMarkerElement fails (e.g. invalid map ID)
      if (window.google && window.google.maps && window.google.maps.Marker) {
         // Note: markers array is typed as AdvancedMarkerElement[], so we cast or maintain separate arrays if needed.
         // For now, we assume if AdvancedMarkerElement exists in type definitions, we use it.
         // But if runtime fails, we can't easily push legacy marker to the same typed array without `any`.
         // We'll log error for now as 'DEMO_MAP_ID' should work based on rendererApi.ts
      }
    }
  }

  function isRoundActive() {
    return document.querySelector('[data-qa="game-layout"]') !== null
  }

  const { chatguessrApi } = window

  if (chatguessrApi) {
    chatguessrApi.onStartRound(() => {
      if (settings.enabled) {
        clearMarkers()
        showMapOverlay()
      }
    })

    chatguessrApi.onGameStarted(() => {
      if (settings.enabled) {
        clearMarkers()
        showMapOverlay()
      }
    })

    chatguessrApi.onReceiveGuess((guess: any) => {
      if (settings.enabled) {
        addGuessMarker(guess)
      }
    })

    chatguessrApi.onReceiveMultiGuesses((guess: any) => {
        if (settings.enabled) {
            addGuessMarker(guess)
        }
    })

    chatguessrApi.onShowRoundResults(() => {
      hideMapOverlay()
    })

    chatguessrApi.onGameQuit(() => {
        hideMapOverlay()
    })
  } else {
    console.error('ChatGuessr API not found for GuessGuessMode')
  }

})()
