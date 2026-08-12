import { contextBridge, ipcRenderer } from 'electron'

// The isolated-world half of the GM API. It owns the IPC plumbing; everything
// user-visible (DOM work, response decoding, the GM_* functions themselves)
// lives in runtime.ts, which runs in the page's main world.

type XhrCallback = (event: GmXhrEvent) => void

const payloads = new Map<string, UserscriptPayload>()
const xhrCallbacks = new Map<string, XhrCallback>()
const notificationCallbacks = new Map<
  string,
  { click: (() => void) | null; close: (() => void) | null }
>()

let nextId = 1
const uniqueId = () => `${Date.now().toString(36)}-${nextId++}`

ipcRenderer.on('userscripts:xhr-event', (_event, reqId: string, payload: GmXhrEvent) => {
  const callback = xhrCallbacks.get(reqId)
  if (!callback) return

  if (payload.type !== 'progress') xhrCallbacks.delete(reqId)

  try {
    callback(payload)
  } catch (err) {
    console.error('[userscripts] xhr callback failed', err)
  }
})

const fireNotification = (id: string, kind: 'click' | 'close') => {
  const handlers = notificationCallbacks.get(id)
  if (!handlers) return
  if (kind === 'close') notificationCallbacks.delete(id)

  try {
    handlers[kind]?.()
  } catch (err) {
    console.error('[userscripts] notification callback failed', err)
  }
}

ipcRenderer.on('userscripts:notification-click', (_event, id: string) =>
  fireNotification(id, 'click')
)
ipcRenderer.on('userscripts:notification-close', (_event, id: string) =>
  fireNotification(id, 'close')
)

export function registerPayloads(scripts: UserscriptPayload[]) {
  for (const script of scripts) payloads.set(script.id, script)
}

/** Exposed to the page as `window.__chatguessrUserscripts`. */
export const userscriptBridge = {
  getData(id: string) {
    const payload = payloads.get(id)
    if (!payload) return null

    return {
      name: payload.name,
      values: { ...payload.values },
      resources: payload.resources,
      info: payload.info
    }
  },

  setValue(id: string, key: string, value: string | null) {
    const payload = payloads.get(id)
    if (!payload) return

    if (value === null) {
      delete payload.values[key]
    } else {
      payload.values[key] = value
    }
    ipcRenderer.send('userscripts:set-value', id, key, value)
  },

  xhr(id: string, options: GmXhrRequest, callback: XhrCallback): string {
    const reqId = uniqueId()
    const payload = payloads.get(id)

    xhrCallbacks.set(reqId, callback)
    ipcRenderer.send('userscripts:xhr', reqId, id, payload?.name ?? id, options)
    return reqId
  },

  abortXhr(reqId: string) {
    xhrCallbacks.delete(reqId)
    ipcRenderer.send('userscripts:xhr-abort', reqId)
  },

  download(details: {
    url: string
    name?: string
    saveAs?: boolean
    headers?: Record<string, string>
  }) {
    return ipcRenderer.invoke('userscripts:download', details)
  },

  setClipboard(text: string) {
    ipcRenderer.send('userscripts:clipboard', text)
  },

  notify(
    details: { title?: string; text?: string; silent?: boolean },
    onClick: (() => void) | null,
    onClose: (() => void) | null
  ) {
    const id = uniqueId()
    notificationCallbacks.set(id, { click: onClick, close: onClose })
    ipcRenderer.send('userscripts:notification', id, details)
  },

  openUrl(url: string) {
    ipcRenderer.send('userscripts:open-url', url)
  }
}

export function exposeUserscriptBridge() {
  contextBridge.exposeInMainWorld('__chatguessrUserscripts', userscriptBridge)
}
