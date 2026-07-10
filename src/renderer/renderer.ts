import { createApp } from 'vue'
import Vue3DraggableResizable from 'vue3-draggable-resizable'
import Frame from './components/Frame.vue'
import ModsControls from './components/Mods/Controls.vue'
import './assets/styles.css'
import './mods/noCarNoCompass'
import './mods/extenssrPostProcessing'
import './mods/extenssrMenuItemsPlugin'

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
  return /^\/(?:maps|me\/maps)(?:\/|$)/.test(window.location.pathname)
}

function getModsControlsTarget() {
  const mapDetailPageMain = document.querySelector(
    '[class^="map-detail-page_main"], [class*=" map-detail-page_main"]'
  )

  if (mapDetailPageMain instanceof HTMLElement) {
    const playBar = mapDetailPageMain.querySelector(
      [
        '[class^="play-bar_root"][class*="play-bar_desktopBar"]',
        '[class*=" play-bar_root"][class*="play-bar_desktopBar"]',
        '[class^="play-bar_root"]',
        '[class*=" play-bar_root"]'
      ].join(', ')
    )
    const leaderboard = mapDetailPageMain.querySelector(
      '[class^="map-detail-leaderboard_root"], [class*=" map-detail-leaderboard_root"]'
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
    const target = document.querySelector(selector)
    if (target instanceof HTMLElement) return { target }
  }

  return null
}

function appendToTarget(targetElement: HTMLElement, before?: HTMLElement, after?: HTMLElement) {
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

  if (modsControls.parentElement === targetElement && targetElement.lastElementChild === modsControls) {
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

const observer = new MutationObserver(() => {
  appendModsControlsComponent()
})
observer.observe(document.body, { childList: true, subtree: true })
window.addEventListener('popstate', appendModsControlsComponent)
window.setInterval(appendModsControlsComponent, 1000)
appendModsControlsComponent()
