import { injectSource, whenDocumentElement } from './userscripts'

// Must match NMNZ_STORAGE_KEY in src/renderer/mods/nmnzTab.ts.
const NMNZ_STORAGE_KEY = 'cg_nmnz__enabled'

/**
 * GeoGuessr's map page only offers Move / No move / NMPZ. The NMNZ tab
 * (src/renderer/mods/nmnzTab.ts) selects "No move" underneath and sets a
 * localStorage flag; this turns that "No move" request into No Move No Zoom
 * (panning allowed) by adding `forbidZooming` to the game or challenge
 * GeoGuessr creates.
 *
 * This function is serialised with `Function.prototype.toString()` and injected
 * into GeoGuessr's main world, so it MUST be self-contained.
 */
function nmnzRequestPatch(storageKey: string) {
  const CREATE_PATHS = ['/api/v3/games', '/api/v3/challenges']
  // `/maps/<slug>`, optionally behind a locale prefix such as `/de`.
  const MAP_PAGE = /^\/(?:[a-z]{2}(?:-[a-z]+)?\/)?maps\/[^/]+\/?$/i
  const originalFetch = window.fetch

  const isEnabled = () => {
    try {
      return window.localStorage.getItem(storageKey) === 'true'
    } catch {
      return false
    }
  }

  /** Only a plain "No move" request is rewritten; Move and NMPZ pass through untouched. */
  const toNmnzBody = (body: BodyInit) => {
    if (typeof body !== 'string') return null

    let settings
    try {
      settings = JSON.parse(body)
    } catch {
      return null
    }
    if (
      settings?.forbidMoving !== true ||
      settings.forbidZooming !== false ||
      settings.forbidRotating !== false
    ) {
      return null
    }
    return JSON.stringify({ ...settings, forbidZooming: true })
  }

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    try {
      if (
        init?.body &&
        init.method?.toUpperCase() === 'POST' &&
        isEnabled() &&
        MAP_PAGE.test(window.location.pathname)
      ) {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          window.location.href
        )
        const body = CREATE_PATHS.includes(url.pathname) ? toNmnzBody(init.body) : null
        if (body !== null) init = { ...init, body }
      }
    } catch (err) {
      console.error('[chatguessr] NMNZ request patch failed', err)
    }
    return originalFetch(input, init)
  }
}

export default function useNmnzRequestPatch() {
  // GeoGuessr's HTTP client keeps the `fetch` it sees when its bundle loads, so
  // the wrapper has to be in place before any of the page's scripts run.
  whenDocumentElement(() => {
    injectSource(`;(${nmnzRequestPatch.toString()})(${JSON.stringify(NMNZ_STORAGE_KEY)});`)
  })
}
