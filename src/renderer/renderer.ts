import { createApp } from 'vue'
import Vue3DraggableResizable from 'vue3-draggable-resizable'
import Frame from './components/Frame.vue'
import ModsControls from './components/Mods/Controls.vue'
import './assets/styles.css'
import './mods/extenssrPostProcessing'
import './mods/noCarNoCompass'
import './mods/extenssrMenuItemsPlugin'
import './mods/nmnzTab'

// MAIN FRAME
const wrapper = document.createElement('div')
document.body.append(wrapper)

createApp(Frame)
  .use(Vue3DraggableResizable)
  .mount(wrapper)
  .$nextTick(() => {
    postMessage({ payload: 'removeLoading' }, '*')
  })

// MODS CONTROLS
const modsControls = document.createElement('div')
modsControls.id = 'mods-controls'
modsControls.classList.add('cg-mods-controls')
createApp(ModsControls).mount(modsControls)

const floatingModsControlsHost = document.createElement('div')
floatingModsControlsHost.id = 'cg-mods-controls-host'
floatingModsControlsHost.setAttribute('data-cg-floating', 'true')

const mapPageTargetSelectors = [
  '[class^="start-standard-game_settings"]',
  '[class*="start-standard-game_settings"]',
  '[class^="community-map-block_lastUpdated"]',
  '[class*="community-map-block_lastUpdated"]',
  '[data-qa="map-page-map-info"]',
  '[data-qa="map-info"]'
]

function isMapsPage() {
  return /^\/maps\/[^/]+\/?$/.test(window.location.pathname)
}

/**
 * The mods panel reuses GeoGuessr's own class names so it inherits their
 * styling — noCarNoCompass, blinkMode and satelliteMode all render a
 * `start-standard-game_settings…` div inside `#mods-controls`. Those are also
 * what we search for to place the panel, so a plain `document.querySelector`
 * can hand back an element inside the panel itself. Appending the panel into
 * its own descendant throws "The new child element contains the parent", which
 * fires once per DOM mutation while GeoGuessr rebuilds the page.
 */
function isOurs(element: Element) {
  return modsControls.contains(element) || floatingModsControlsHost.contains(element)
}

function queryOutsidePanel(selector: string, root: ParentNode = document): HTMLElement | null {
  for (const element of root.querySelectorAll(selector)) {
    if (element instanceof HTMLElement && !isOurs(element)) return element
  }
  return null
}

function getModsControlsTarget() {
  const mapDetailPageMain = queryOutsidePanel(
    '[class^="map-detail-page_main"], [class*=" map-detail-page_main"]'
  )

  if (mapDetailPageMain instanceof HTMLElement) {
    const playBar = queryOutsidePanel(
      [
        '[class^="play-bar_root"][class*="play-bar_desktopBar"]',
        '[class*=" play-bar_root"][class*="play-bar_desktopBar"]',
        '[class^="play-bar_root"]',
        '[class*=" play-bar_root"]'
      ].join(', '),
      mapDetailPageMain
    )
    const leaderboard = queryOutsidePanel(
      '[class^="map-detail-leaderboard_root"], [class*=" map-detail-leaderboard_root"]',
      mapDetailPageMain
    )

    if (playBar instanceof HTMLElement) {
      return { target: mapDetailPageMain, after: playBar }
    }

    if (leaderboard instanceof HTMLElement) {
      return { target: mapDetailPageMain, before: leaderboard }
    }

    return { target: mapDetailPageMain }
  }

  for (const selector of mapPageTargetSelectors) {
    const target = queryOutsidePanel(selector)
    if (target) return { target }
  }

  return null
}

function appendToTarget(targetElement: HTMLElement, before?: HTMLElement, after?: HTMLElement) {
  // Last line of defence: never append the panel into its own subtree.
  if (modsControls.contains(targetElement)) return

  modsControls.setAttribute('data-cg-floating', 'false')

  if (before) {
    if (modsControls.parentElement === targetElement && modsControls.nextSibling === before) return
    targetElement.insertBefore(modsControls, before)
    return
  }

  if (after?.nextSibling) {
    if (modsControls.parentElement === targetElement && after.nextSibling === modsControls) return
    targetElement.insertBefore(modsControls, after.nextSibling)
    return
  }

  if (
    modsControls.parentElement === targetElement &&
    targetElement.lastElementChild === modsControls
  ) {
    return
  }
  targetElement.appendChild(modsControls)
}

function appendToFloatingHost() {
  if (!document.body.contains(floatingModsControlsHost)) {
    document.body.appendChild(floatingModsControlsHost)
  }

  if (modsControls.parentElement !== floatingModsControlsHost) {
    modsControls.setAttribute('data-cg-floating', 'true')
    floatingModsControlsHost.appendChild(modsControls)
  }
}

const appendModsControlsComponent = () => {
  if (!isMapsPage()) {
    modsControls.remove()
    floatingModsControlsHost.remove()
    return
  }

  const targetPlacement = getModsControlsTarget()
  if (targetPlacement) {
    appendToTarget(targetPlacement.target, targetPlacement.before, targetPlacement.after)
    floatingModsControlsHost.remove()
    return
  }

  appendToFloatingHost()
}

function updateRoundStatusTitle() {
  const panel = document.querySelector('[data-qa="rounds-status"]')
  const title = panel?.querySelector<HTMLElement>('[class^="rounds-status_mapTitle__"]')
  if (!title) return

  const round = panel?.querySelector('[data-qa="current-round-number"]')?.textContent?.trim()
  const total = panel?.querySelectorAll('[data-qa="round"]').length ?? 0
  const label = round && total ? `${round}/${total} rounds` : ''
  if (label) {
    if (title.dataset.cgRounds !== label) title.dataset.cgRounds = label
  } else if (title.hasAttribute('data-cg-rounds')) {
    title.removeAttribute('data-cg-rounds')
  }
}

// Coalesce to one placement pass per frame. Leaving a game churns through
// thousands of body mutations while GeoGuessr tears down and rebuilds the page;
// running the (document-wide, multi-selector) placement sweep on every single
// one of them starves the main thread and the page never gets to paint.
let placementScheduled = false

const scheduleModsControlsPlacement = () => {
  if (placementScheduled) return
  placementScheduled = true

  requestAnimationFrame(() => {
    placementScheduled = false
    try {
      appendModsControlsComponent()
      updateRoundStatusTitle()
    } catch (err) {
      // A placement failure must never escape into the observer callback and
      // repeat on every mutation.
      console.error('[chatguessr] failed to place mods controls', err)
    }
  })
}

const observer = new MutationObserver(scheduleModsControlsPlacement)
observer.observe(document.body, { childList: true, subtree: true })
window.addEventListener('popstate', scheduleModsControlsPlacement)
window.setInterval(scheduleModsControlsPlacement, 1000)
scheduleModsControlsPlacement()
