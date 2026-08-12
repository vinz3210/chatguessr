import { ipcRenderer } from 'electron'
import { exposeUserscriptBridge, registerPayloads } from './bridge'
import { userscriptRuntime, USERSCRIPT_API_NAMES } from './runtime'

// Injects installed userscripts into the GeoGuessr page. Like Tampermonkey,
// scripts run once per document load and are not re-run on the SPA's soft
// navigations — script authors are expected to handle that themselves.

const API_NAMES = new Set(USERSCRIPT_API_NAMES)

/** `@grant GM.setValue` and friends all resolve to the single `GM` object. */
function grantedIdentifiers(grants: string[] | null): string[] {
  if (grants === null) return USERSCRIPT_API_NAMES

  const identifiers = new Set<string>(['GM_info', 'unsafeWindow'])
  for (const grant of grants) {
    const identifier = grant.includes('.') ? 'GM' : grant
    if (API_NAMES.has(identifier)) identifiers.add(identifier)
  }
  return [...identifiers]
}

function buildScript(payload: UserscriptPayload): string {
  const declarations = grantedIdentifiers(payload.grants)
    .map((name) => `  const ${name} = __cgApi.${name};`)
    .join('\n')

  // The name only ends up in a sourceURL comment, so strip anything that could
  // break out of the comment line.
  const sourceName = payload.name.replace(/[^\w.-]+/g, '_')

  return `;(function () {
  const __cgApi = window.__chatguessrUserscriptApi(${JSON.stringify(payload.id)});
  if (!__cgApi) return;
${declarations}
  try {
${payload.requires.join('\n')}
${payload.code}
  } catch (err) {
    console.error('[userscript] ${sourceName} failed:', err);
  }
})();
//# sourceURL=chatguessr-userscript://${sourceName}.user.js
`
}

function injectSource(source: string) {
  const script = document.createElement('script')
  script.textContent = source

  const parent = document.head ?? document.documentElement ?? document.body
  parent.appendChild(script)
  // The code has already run by the time appendChild returns; the element
  // itself is just noise in the DOM.
  script.remove()
}

/** Runs `callback` as soon as `<html>` exists — preload can beat the parser. */
function whenDocumentElement(callback: () => void) {
  if (document.documentElement) return callback()

  const observer = new MutationObserver(() => {
    if (!document.documentElement) return
    observer.disconnect()
    callback()
  })
  observer.observe(document, { childList: true, subtree: true })
}

function whenBody(callback: () => void) {
  if (document.body) return callback()

  const observer = new MutationObserver(() => {
    if (!document.body) return
    observer.disconnect()
    callback()
  })
  observer.observe(document.documentElement ?? document, { childList: true, subtree: true })
}

function whenDomReady(callback: () => void) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => callback(), { once: true })
  } else {
    callback()
  }
}

function schedule(runAt: UserscriptRunAt, callback: () => void) {
  switch (runAt) {
    case 'document-start':
      whenDocumentElement(callback)
      break
    case 'document-body':
      whenBody(callback)
      break
    case 'document-end':
      whenDomReady(callback)
      break
    default:
      // document-idle: after parsing, once the current task has drained.
      whenDomReady(() => setTimeout(callback, 0))
  }
}

export default function useUserscripts() {
  let payloads: UserscriptPayload[]
  try {
    payloads = ipcRenderer.sendSync('userscripts:payload', window.location.href) ?? []
  } catch (err) {
    console.error('[userscripts] could not load payloads', err)
    return
  }

  const isTopFrame = window.top === window.self
  const scripts = payloads.filter((payload) => isTopFrame || !payload.noframes)
  if (scripts.length === 0) return

  registerPayloads(scripts)
  exposeUserscriptBridge()

  whenDocumentElement(() => {
    injectSource(`;(${userscriptRuntime.toString()})();`)

    for (const payload of scripts) {
      schedule(payload.runAt, () => {
        try {
          injectSource(buildScript(payload))
        } catch (err) {
          console.error(`[userscripts] failed to inject ${payload.name}`, err)
        }
      })
    }
  })
}
