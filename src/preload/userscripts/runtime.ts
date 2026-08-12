/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types, @typescript-eslint/no-empty-function */
// This file mirrors the loosely typed GM_* API surface that userscripts expect,
// so `any` and bare `Function` callbacks are deliberate here.

/**
 * Every identifier the runtime can hand to a script. Scripts that declare no
 * `@grant` at all get all of them; scripts with an explicit `@grant` list get
 * only what they asked for. Must stay in sync with the object `createApi`
 * returns below.
 */
export const USERSCRIPT_API_NAMES = [
  'GM',
  'GM_info',
  'GM_getValue',
  'GM_setValue',
  'GM_deleteValue',
  'GM_listValues',
  'GM_getValues',
  'GM_setValues',
  'GM_addValueChangeListener',
  'GM_removeValueChangeListener',
  'GM_getResourceText',
  'GM_getResourceURL',
  'GM_getResourceUrl',
  'GM_addStyle',
  'GM_addElement',
  'GM_xmlhttpRequest',
  'GM_download',
  'GM_openInTab',
  'GM_setClipboard',
  'GM_notification',
  'GM_registerMenuCommand',
  'GM_unregisterMenuCommand',
  'GM_log',
  'GM_getTab',
  'GM_saveTab',
  'GM_getTabs',
  'unsafeWindow'
]

/**
 * The GM_* API implementation.
 *
 * This function is serialised with `Function.prototype.toString()` and injected
 * into GeoGuessr's main world, so it MUST be self-contained: no imports, no
 * references to anything in module scope. Everything that needs the main
 * process goes through `window.__chatguessrUserscripts`, the contextBridge
 * object set up in `bridge.ts`. Everything that touches the DOM is done here,
 * because DOM objects cannot cross the contextBridge.
 */
export function userscriptRuntime() {
  const w = window as any
  const bridge = w.__chatguessrUserscripts
  if (!bridge) return

  // Shared with the Vue overlay, which renders these as buttons.
  const menu = (w.__chatguessrUserscriptMenu = w.__chatguessrUserscriptMenu || {
    commands: [],
    nextId: 1
  })

  const notifyMenuChanged = () => {
    window.dispatchEvent(new CustomEvent('cg-userscript-menu-changed'))
  }

  // Binary payloads are base64 encoded on both legs of the contextBridge trip:
  // only strings and plain objects cross it reliably.
  const toBase64 = (bytes: Uint8Array) => {
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)))
    }
    return btoa(binary)
  }

  const fromBase64 = (encoded: string) => {
    const binary = atob(encoded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }

  /** Splits a GM_xhr `data` option into a text body and a base64 binary body. */
  const encodeBody = (data: any): { data: string | null; dataBase64: string | null } => {
    if (data == null) return { data: null, dataBase64: null }
    if (typeof data === 'string') return { data, dataBase64: null }
    if (data instanceof URLSearchParams) return { data: data.toString(), dataBase64: null }
    if (data instanceof ArrayBuffer) {
      return { data: null, dataBase64: toBase64(new Uint8Array(data)) }
    }
    if (ArrayBuffer.isView(data)) {
      const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      return { data: null, dataBase64: toBase64(view) }
    }
    return { data: String(data), dataBase64: null }
  }

  w.__chatguessrUserscriptApi = function createApi(id: string) {
    const data = bridge.getData(id)
    if (!data) return null

    // Local mirror of the value store so GM_getValue/GM_setValue stay
    // synchronous like they are in Tampermonkey. Writes are persisted async.
    const values: Record<string, string> = data.values || {}
    const valueListeners: Record<string, { id: number; key: string; fn: Function }[]> = {}
    let nextListenerId = 1

    const fireValueChange = (key: string, oldValue: any, newValue: any) => {
      for (const listener of valueListeners[key] || []) {
        try {
          listener.fn(key, oldValue, newValue, false)
        } catch (err) {
          console.error('[userscript] value change listener failed', err)
        }
      }
    }

    const GM_getValue = (key: string, defaultValue?: any) => {
      const raw = values[key]
      if (raw === undefined) return defaultValue
      try {
        return JSON.parse(raw)
      } catch {
        return defaultValue
      }
    }

    const GM_setValue = (key: string, value: any) => {
      const oldValue = GM_getValue(key)
      const raw = JSON.stringify(value)
      // `undefined` has no JSON representation — treat it as a delete.
      if (raw === undefined) return GM_deleteValue(key)

      values[key] = raw
      bridge.setValue(id, key, raw)
      fireValueChange(key, oldValue, value)
      return undefined
    }

    const GM_deleteValue = (key: string) => {
      const oldValue = GM_getValue(key)
      delete values[key]
      bridge.setValue(id, key, null)
      fireValueChange(key, oldValue, undefined)
    }

    const GM_listValues = () => Object.keys(values)

    const GM_getValues = (keys: any) => {
      const result: Record<string, any> = {}
      if (Array.isArray(keys)) {
        for (const key of keys) result[key] = GM_getValue(key)
      } else {
        for (const key of Object.keys(keys || {})) result[key] = GM_getValue(key, keys[key])
      }
      return result
    }

    const GM_setValues = (entries: Record<string, any>) => {
      for (const key of Object.keys(entries || {})) GM_setValue(key, entries[key])
    }

    const GM_addValueChangeListener = (key: string, fn: Function) => {
      const listenerId = nextListenerId++
      ;(valueListeners[key] = valueListeners[key] || []).push({ id: listenerId, key, fn })
      return listenerId
    }

    const GM_removeValueChangeListener = (listenerId: number) => {
      for (const key of Object.keys(valueListeners)) {
        valueListeners[key] = valueListeners[key].filter((entry) => entry.id !== listenerId)
      }
    }

    const resources = data.resources || {}
    const GM_getResourceText = (name: string) => {
      const resource = resources[name]
      return resource ? resource.text : undefined
    }
    const GM_getResourceURL = (name: string) => {
      const resource = resources[name]
      return resource ? resource.dataUrl : undefined
    }

    const GM_addStyle = (css: string) => {
      const style = document.createElement('style')
      style.textContent = css
      ;(document.head || document.documentElement).appendChild(style)
      return style
    }

    const GM_addElement = (...args: any[]) => {
      const parent = typeof args[0] === 'string' ? null : args[0]
      const tagName = typeof args[0] === 'string' ? args[0] : args[1]
      const attributes = (typeof args[0] === 'string' ? args[1] : args[2]) || {}

      const element = document.createElement(tagName)
      for (const name of Object.keys(attributes)) {
        if (name === 'textContent') {
          element.textContent = attributes[name]
        } else {
          element.setAttribute(name, attributes[name])
        }
      }
      ;(parent || document.head || document.documentElement).appendChild(element)
      return element
    }

    const GM_xmlhttpRequest = (details: any) => {
      const responseType = details.responseType || ''
      let finished = false

      const buildResponse = (event: any) => {
        const bytes = fromBase64(event.bodyBase64)
        let responseText = ''
        try {
          responseText = new TextDecoder().decode(bytes)
        } catch {
          responseText = ''
        }

        let response: any = responseText
        try {
          if (responseType === 'arraybuffer') {
            response = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
          } else if (responseType === 'blob') {
            response = new Blob([bytes])
          } else if (responseType === 'json') {
            response = JSON.parse(responseText)
          } else if (responseType === 'document') {
            response = new DOMParser().parseFromString(responseText, 'text/html')
          }
        } catch {
          response = null
        }

        return {
          readyState: 4,
          status: event.status,
          statusText: event.statusText,
          finalUrl: event.finalUrl,
          responseHeaders: event.responseHeaders,
          responseText:
            responseType === 'arraybuffer' || responseType === 'blob' ? '' : responseText,
          response,
          context: details.context
        }
      }

      const call = (fn: any, arg: any) => {
        if (typeof fn !== 'function') return
        try {
          fn(arg)
        } catch (err) {
          console.error('[userscript] GM_xmlhttpRequest callback failed', err)
        }
      }

      const body = encodeBody(details.data)

      const reqId = bridge.xhr(
        id,
        {
          method: details.method,
          url: details.url,
          headers: details.headers,
          data: body.data,
          dataBase64: body.dataBase64,
          responseType,
          timeout: details.timeout,
          anonymous: details.anonymous,
          redirect: details.redirect,
          user: details.user,
          password: details.password
        },
        (event: any) => {
          if (finished) return

          if (event.type === 'progress') {
            call(details.onprogress, {
              loaded: event.loaded,
              total: event.total,
              lengthComputable: event.lengthComputable
            })
            return
          }

          finished = true

          if (event.type === 'load') {
            const response = buildResponse(event)
            call(details.onreadystatechange, response)
            if (response.status >= 200 && response.status < 400) {
              call(details.onload, response)
            } else {
              call(details.onerror, response)
            }
          } else if (event.type === 'timeout') {
            call(details.ontimeout, { readyState: 4, status: 0, context: details.context })
          } else if (event.type === 'abort') {
            call(details.onabort, { readyState: 4, status: 0, context: details.context })
          } else {
            call(details.onerror, {
              readyState: 4,
              status: 0,
              error: event.error,
              context: details.context
            })
          }
        }
      )

      call(details.onloadstart, { readyState: 1, context: details.context })

      return {
        abort() {
          bridge.abortXhr(reqId)
        }
      }
    }

    const GM_download = (arg: any, name?: string) => {
      const details = typeof arg === 'string' ? { url: arg, name } : arg

      bridge
        .download({
          url: details.url,
          name: details.name,
          saveAs: details.saveAs,
          headers: details.headers
        })
        .then((result: any) => {
          if (result.ok) {
            if (typeof details.onload === 'function') details.onload(result)
          } else if (typeof details.onerror === 'function') {
            details.onerror({ error: result.error })
          }
        })

      return { abort() {} }
    }

    const GM_openInTab = (url: string) => {
      bridge.openUrl(url)
      return { close() {}, closed: false, onclose: null }
    }

    const GM_setClipboard = (text: any) => bridge.setClipboard(String(text))

    const GM_notification = (...args: any[]) => {
      const details =
        typeof args[0] === 'string'
          ? { text: args[0], title: args[1], image: args[2], onclick: args[3] }
          : args[0]

      bridge.notify(
        { title: details.title, text: details.text, silent: details.silent },
        typeof details.onclick === 'function' ? details.onclick : null,
        typeof details.ondone === 'function' ? details.ondone : null
      )
    }

    const GM_registerMenuCommand = (caption: string, fn: Function, accessKey?: string) => {
      const commandId = menu.nextId++
      menu.commands.push({
        id: commandId,
        scriptId: id,
        scriptName: data.name,
        caption,
        accessKey,
        run: fn
      })
      notifyMenuChanged()
      return commandId
    }

    const GM_unregisterMenuCommand = (commandId: number) => {
      const index = menu.commands.findIndex((command: any) => command.id === commandId)
      if (index === -1) return
      menu.commands.splice(index, 1)
      notifyMenuChanged()
    }

    const GM_log = (...args: any[]) => console.log(`[${data.name}]`, ...args)

    // Per-tab scratch storage. There is only ever one window, so "tabs" is a
    // single object kept in memory for the lifetime of the page.
    let tabData: any = {}
    const GM_getTab = (fn: Function) => fn(tabData)
    const GM_saveTab = (value: any) => {
      tabData = value
    }
    const GM_getTabs = (fn: Function) => fn({ 0: tabData })

    const promisify =
      (fn: Function) =>
      (...args: any[]) => {
        try {
          return Promise.resolve(fn(...args))
        } catch (err) {
          return Promise.reject(err)
        }
      }

    const GM = {
      info: data.info,
      getValue: promisify(GM_getValue),
      setValue: promisify(GM_setValue),
      deleteValue: promisify(GM_deleteValue),
      listValues: promisify(GM_listValues),
      getResourceText: promisify(GM_getResourceText),
      getResourceUrl: promisify(GM_getResourceURL),
      getResourceURL: promisify(GM_getResourceURL),
      addStyle: promisify(GM_addStyle),
      addElement: promisify(GM_addElement),
      xmlHttpRequest: GM_xmlhttpRequest,
      download: GM_download,
      openInTab: GM_openInTab,
      setClipboard: promisify(GM_setClipboard),
      notification: GM_notification,
      registerMenuCommand: GM_registerMenuCommand,
      unregisterMenuCommand: GM_unregisterMenuCommand,
      log: GM_log,
      getTab: GM_getTab,
      saveTab: GM_saveTab,
      getTabs: GM_getTabs
    }

    return {
      GM,
      GM_info: data.info,
      GM_getValue,
      GM_setValue,
      GM_deleteValue,
      GM_listValues,
      GM_getValues,
      GM_setValues,
      GM_addValueChangeListener,
      GM_removeValueChangeListener,
      GM_getResourceText,
      GM_getResourceURL,
      GM_getResourceUrl: GM_getResourceURL,
      GM_addStyle,
      GM_addElement,
      GM_xmlhttpRequest,
      GM_download,
      GM_openInTab,
      GM_setClipboard,
      GM_notification,
      GM_registerMenuCommand,
      GM_unregisterMenuCommand,
      GM_log,
      GM_getTab,
      GM_saveTab,
      GM_getTabs,
      unsafeWindow: window
    }
  }
}
