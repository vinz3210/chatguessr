import { getLocalStorage, setLocalStorage } from '../useLocalStorage'

// Adds an NMNZ (no move, no zoom; panning allowed) option between "No move"
// and "NMPZ" on GeoGuessr's map page movement toggle.
//
// GeoGuessr only knows Move / No move / NMPZ, so picking NMNZ selects "No move"
// underneath and sets a flag. The preload's fetch patch
// (src/preload/nmnzRequestPatch.ts) reads that flag and adds `forbidZooming`
// when the game is created.

// Must match NMNZ_STORAGE_KEY in src/preload/nmnzRequestPatch.ts.
const NMNZ_STORAGE_KEY = 'cg_nmnz__enabled'
const NMNZ_ATTR = 'data-cg-nmnz'

let enabled = getLocalStorage<boolean>(NMNZ_STORAGE_KEY, false) === true

function setEnabled(value: boolean) {
  enabled = value
  setLocalStorage(NMNZ_STORAGE_KEY, value)
}

function setAttr(element: Element, name: string, value: string | null) {
  if (element.getAttribute(name) === value) return
  if (value === null) element.removeAttribute(name)
  else element.setAttribute(name, value)
}

function setStyleVar(element: HTMLElement, name: string, value: string) {
  if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value)
}

const tabLabel = (tab: Element) => tab.textContent?.trim().toUpperCase()

/** GeoGuessr's own movement tabs: Move, No move, NMPZ. The labels aren't localised. */
function findMovementTabLists() {
  const found: { list: HTMLElement; noMove: HTMLElement; nmpz: HTMLElement }[] = []

  for (const list of document.querySelectorAll<HTMLElement>('[role="tablist"]')) {
    const tabs = [...list.children].filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        child.getAttribute('role') === 'tab' &&
        !child.hasAttribute(NMNZ_ATTR)
    )
    if (tabs.length === 3 && tabLabel(tabs[1]) === 'NO MOVE' && tabLabel(tabs[2]) === 'NMPZ') {
      found.push({ list, noMove: tabs[1], nmpz: tabs[2] })
    }
  }
  return found
}

const resizeObserver = new ResizeObserver(() => scheduleSync())

function createNmnzTab(list: HTMLElement, noMove: HTMLElement) {
  // A clone picks up GeoGuessr's hashed class names and markup. React never
  // sees it, so the click is ours to handle.
  const tab = noMove.cloneNode(true) as HTMLElement
  tab.removeAttribute('id')
  tab.removeAttribute('aria-controls')
  tab.setAttribute(NMNZ_ATTR, '')
  tab.title = 'No move, no zoom (panning allowed)'
  ;(tab.querySelector('span') ?? tab).textContent = 'NMNZ'

  tab.addEventListener('click', () => {
    // Goes through the native-tab listener below, which clears the flag, so
    // the flag has to be set afterwards.
    noMove.click()
    setEnabled(true)
    scheduleSync()
  })

  list.addEventListener(
    'click',
    (event) => {
      const target = event.target instanceof Element ? event.target.closest('[role="tab"]') : null
      if (!target || target.hasAttribute(NMNZ_ATTR)) return
      setEnabled(false)
      scheduleSync()
    },
    true
  )

  resizeObserver.observe(list)
  return tab
}

function sync() {
  for (const { list, noMove, nmpz } of findMovementTabLists()) {
    const nmnz =
      list.querySelector<HTMLElement>(`:scope > [${NMNZ_ATTR}]`) ?? createNmnzTab(list, noMove)
    if (nmnz.nextElementSibling !== nmpz) list.insertBefore(nmnz, nmpz)

    // GeoGuessr still has "No move" selected while NMNZ is active; the CSS in
    // override-gg-styles.css dims it.
    const active = enabled && noMove.getAttribute('aria-selected') === 'true'
    setAttr(nmnz, 'aria-selected', String(active))
    setAttr(nmnz, 'data-state', active ? 'active' : 'inactive')
    setAttr(nmnz, 'tabindex', active ? '0' : '-1')
    setAttr(list, 'data-cg-nmnz-active', active ? '' : null)

    // GeoGuessr only measures the slider when the selection changes, so it
    // misses NMPZ shifting right when our tab is inserted, and it would never
    // point at our tab anyway. Position it ourselves.
    const selected = active
      ? nmnz
      : list.querySelector<HTMLElement>(':scope > [role="tab"][aria-selected="true"]')
    if (selected) {
      setStyleVar(list, '--cg-tab-active-x', `${selected.offsetLeft}px`)
      setStyleVar(list, '--cg-tab-active-w', `${selected.offsetWidth}px`)
      setAttr(list, 'data-cg-nmnz-tabs', '')
    }
  }
}

let syncScheduled = false

function scheduleSync() {
  if (syncScheduled) return
  syncScheduled = true

  requestAnimationFrame(() => {
    syncScheduled = false
    try {
      sync()
    } catch (err) {
      console.error('[chatguessr] failed to sync NMNZ tab', err)
    }
  })
}

new MutationObserver(scheduleSync).observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['aria-selected']
})
scheduleSync()
