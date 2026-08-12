import fs from 'fs'
import { join, basename, extname } from 'path'
import { app, dialog, ipcMain, net, shell, clipboard, Notification } from 'electron'
import type { BrowserWindow, IpcMainEvent, WebContents } from 'electron'
import {
  getPayloadsForUrl,
  getUserscriptSource,
  getUserscriptsDir,
  installFromFile,
  installFromUrl,
  listUserscripts,
  removeUserscript,
  setUserscriptEnabled,
  setValue,
  updateUserscript
} from './manager'
import { canConnect, clearPermissions } from './permissions'

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

const sendTo = (sender: WebContents, channel: string, ...args: unknown[]) => {
  if (!sender.isDestroyed()) sender.send(channel, ...args)
}

/** In-flight GM_xmlhttpRequest calls, keyed by the id the renderer generated. */
const activeRequests = new Map<string, Electron.ClientRequest>()

function rawHeaders(headers: Record<string, string | string[]>) {
  return Object.entries(headers)
    .map(([name, value]) => (Array.isArray(value) ? value : [value]).map((v) => `${name}: ${v}`))
    .flat()
    .join('\r\n')
}

function startXhr(
  event: IpcMainEvent,
  reqId: string,
  options: GmXhrRequest,
  window: BrowserWindow
) {
  const { sender } = event
  const emit = (payload: GmXhrEvent) => sendTo(sender, 'userscripts:xhr-event', reqId, payload)

  const request = net.request({
    method: (options.method ?? 'GET').toUpperCase(),
    url: options.url,
    redirect: options.redirect === 'manual' ? 'manual' : 'follow',
    session: window.webContents.session,
    // GM_xhr sends the user's cookies unless the script opts out with `anonymous`.
    useSessionCookies: options.anonymous !== true
  })

  activeRequests.set(reqId, request)

  let settled = false
  const finish = (payload: GmXhrEvent) => {
    if (settled) return
    settled = true
    clearTimeout(timeoutHandle)
    activeRequests.delete(reqId)
    emit(payload)
  }

  const timeoutHandle = options.timeout
    ? setTimeout(() => {
        if (settled) return
        request.abort()
        finish({ type: 'timeout' })
      }, options.timeout)
    : undefined

  for (const [name, value] of Object.entries(options.headers ?? {})) {
    try {
      request.setHeader(name, value)
    } catch {
      // Chromium refuses some headers (Host, Content-Length, …); skip them
      // rather than failing the whole request.
    }
  }

  if (options.user) {
    const credentials = Buffer.from(`${options.user}:${options.password ?? ''}`).toString('base64')
    request.setHeader('Authorization', `Basic ${credentials}`)
  }

  request.on('response', (response) => {
    const chunks: Buffer[] = []
    let loaded = 0

    const contentLength = response.headers['content-length']
    const total = Number(Array.isArray(contentLength) ? contentLength[0] : (contentLength ?? 0))

    response.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
      loaded += chunk.length
      emit({ type: 'progress', loaded, total, lengthComputable: total > 0 })
    })

    response.on('end', () => {
      finish({
        type: 'load',
        status: response.statusCode,
        statusText: response.statusMessage,
        finalUrl: options.url,
        responseHeaders: rawHeaders(response.headers),
        bodyBase64: Buffer.concat(chunks).toString('base64')
      })
    })

    response.on('error', (err: Error) => finish({ type: 'error', error: errorMessage(err) }))
  })

  request.on('abort', () => finish({ type: 'abort' }))
  request.on('error', (err) => finish({ type: 'error', error: errorMessage(err) }))

  if (options.dataBase64) {
    request.write(Buffer.from(options.dataBase64, 'base64'))
  } else if (options.data != null) {
    request.write(options.data)
  }
  request.end()
}

const safeFileName = (name: string) =>
  basename(name)
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim()

function suggestedFileName(details: { url: string; name?: string }) {
  if (details.name) return safeFileName(details.name) || 'download'
  try {
    return safeFileName(basename(new URL(details.url).pathname)) || 'download'
  } catch {
    return 'download'
  }
}

async function download(
  window: BrowserWindow,
  details: { url: string; name?: string; saveAs?: boolean; headers?: Record<string, string> }
): Promise<{ ok: boolean; path?: string; error?: string }> {
  let targetPath: string

  const suggested = suggestedFileName(details)

  if (details.saveAs) {
    const result = await dialog.showSaveDialog(window, {
      title: 'Save file',
      defaultPath: join(app.getPath('downloads'), suggested)
    })
    if (result.canceled || !result.filePath) return { ok: false, error: 'not_permitted' }
    targetPath = result.filePath
  } else {
    targetPath = join(app.getPath('downloads'), suggested)

    // Don't silently clobber an existing file: name_1.ext, name_2.ext, …
    const ext = extname(targetPath)
    const stem = targetPath.slice(0, targetPath.length - ext.length)
    for (let i = 1; fs.existsSync(targetPath); i++) {
      targetPath = `${stem}_${i}${ext}`
    }
  }

  try {
    const response = await net.fetch(details.url, {
      headers: details.headers,
      credentials: 'include'
    })
    if (!response.ok) return { ok: false, error: 'not_succeeded' }

    const buffer = Buffer.from(await response.arrayBuffer())
    await fs.promises.writeFile(targetPath, new Uint8Array(buffer))
    return { ok: true, path: targetPath }
  } catch (err) {
    return { ok: false, error: errorMessage(err) }
  }
}

export default function registerUserscriptIpc(window: BrowserWindow) {
  // Injection payload. Synchronous because the preload has to inject
  // `@run-at document-start` scripts before the page's own scripts run.
  ipcMain.on('userscripts:payload', (event, url: string) => {
    try {
      event.returnValue = getPayloadsForUrl(url)
    } catch (err) {
      console.error('[userscripts] failed to build payloads', err)
      event.returnValue = []
    }
  })

  // -- GM APIs --

  ipcMain.on('userscripts:set-value', (_event, id: string, key: string, value: string | null) => {
    setValue(id, key, value)
  })

  // Aborts that arrive while the @connect permission prompt is still open.
  const abortedBeforeStart = new Set<string>()

  ipcMain.on(
    'userscripts:xhr',
    async (event, reqId: string, id: string, name: string, options: GmXhrRequest) => {
      const allowed = await canConnect(window, id, name, options.url)
      if (!allowed) {
        sendTo(event.sender, 'userscripts:xhr-event', reqId, {
          type: 'error',
          error: 'Request blocked: domain not allowed for this userscript'
        } satisfies GmXhrEvent)
        return
      }

      // The script may have aborted while the permission prompt was up.
      if (abortedBeforeStart.delete(reqId)) return

      startXhr(event, reqId, options, window)
    }
  )

  ipcMain.on('userscripts:xhr-abort', (_event, reqId: string) => {
    const request = activeRequests.get(reqId)
    if (request) {
      request.abort()
    } else {
      abortedBeforeStart.add(reqId)
    }
  })

  ipcMain.handle('userscripts:download', (_event, details) => download(window, details))

  ipcMain.on('userscripts:clipboard', (_event, text: string) => clipboard.writeText(text))

  ipcMain.on('userscripts:notification', (event, notificationId: string, details) => {
    if (!Notification.isSupported()) return

    const notification = new Notification({
      title: details.title ?? 'ChatGuessr',
      body: details.text ?? '',
      silent: details.silent === true
    })
    notification.on('click', () =>
      sendTo(event.sender, 'userscripts:notification-click', notificationId)
    )
    notification.on('close', () =>
      sendTo(event.sender, 'userscripts:notification-close', notificationId)
    )
    notification.show()
  })

  ipcMain.on('userscripts:open-url', (_event, url: string) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })

  // -- Management, called from the settings UI --

  ipcMain.handle('userscripts:list', () => listUserscripts())

  ipcMain.handle('userscripts:install-from-file', async (): Promise<UserscriptInstallResult> => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Import userscript',
      buttonLabel: 'Import',
      filters: [{ name: 'Userscripts', extensions: ['js', 'user.js'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return { ok: false }

    try {
      return { ok: true, script: await installFromFile(result.filePaths[0]) }
    } catch (err) {
      return { ok: false, error: errorMessage(err) }
    }
  })

  ipcMain.handle(
    'userscripts:install-from-url',
    async (_event, url: string): Promise<UserscriptInstallResult> => {
      try {
        return { ok: true, script: await installFromUrl(url) }
      } catch (err) {
        return { ok: false, error: errorMessage(err) }
      }
    }
  )

  ipcMain.handle('userscripts:set-enabled', (_event, id: string, enabled: boolean) =>
    setUserscriptEnabled(id, enabled)
  )

  ipcMain.handle('userscripts:remove', (_event, id: string) => {
    clearPermissions(id)
    return removeUserscript(id)
  })

  ipcMain.handle('userscripts:update', (_event, id: string) => updateUserscript(id))

  ipcMain.handle('userscripts:get-source', (_event, id: string) => getUserscriptSource(id))

  ipcMain.handle('userscripts:open-folder', () => shell.openPath(getUserscriptsDir()))
}
