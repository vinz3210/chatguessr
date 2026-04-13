import { join } from 'path'
import { BrowserWindow, shell } from 'electron'

const isDev = process.env.npm_lifecycle_event === 'dev'

// Create the Main window.
export default function createWindow() {
  const win = new BrowserWindow({
    show: false,
    ...(process.platform === 'linux' ? { icon: join(__dirname, '../../build/icon.png') } : {}),
    webPreferences: {
      preload: join(__dirname, './preload.js'),
      devTools: isDev ? true : false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // only needed for timer sound alert
      webSecurity: false
    }
  })

  win.setMenuBarVisibility(false)

  // Remove Electron identifier from user agent so Cloudflare Turnstile doesn't block login
  // Must be set on the session (not just webContents) so iframes like Turnstile also get the clean UA
  const ua = win.webContents.getUserAgent().replace(/\s*Electron\/\S+/, '')
  win.webContents.session.setUserAgent(ua)

  win.loadURL('https://www.geoguessr.com/maps/community')

  // Adapt all calls for api/v3/search/any to api/v3/search/map
  win.webContents.session.webRequest.onBeforeRequest(
    { urls: ['https://www.geoguessr.com/api/v3/search/any*'] },
    ({ url }, callback) => {
      callback({ redirectURL: url.replace('any', 'map') })
    }
  )
   

  // Open links in default OS browser
  // Allow GeoGuessr socials login to open a new window
  win.webContents.setWindowOpenHandler(({ url }) => {
    const socialUrls = [
      'https://www.facebook.com',
      'https://accounts.google.com',
      'https://appleid.apple.com'
    ]
    if (socialUrls.some((_url) => url.startsWith(_url))) return { action: 'allow' }

    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.once('ready-to-show', () => {
    win.show()
    win.maximize()
    if (isDev) win.webContents.openDevTools()
  })

  win.on('close', () => BrowserWindow.getAllWindows().forEach((window) => window.destroy()))

  return win
}
