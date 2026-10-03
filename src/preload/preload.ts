import fs from 'fs'
import { join } from 'path'
import { contextBridge } from 'electron'
import { chatguessrApi } from './chatguessrApi'
import whenDomReady from 'when-dom-ready'
import useLoading from './useLoading'
import useUserscripts from './userscripts'
import useNmnzRequestPatch from './nmnzRequestPatch'

const { appendLoading, removeLoading } = useLoading()

// Runs first so `@run-at document-start` scripts land before the page's own.
useUserscripts()
useNmnzRequestPatch()

const rendererJS = fs.readFileSync(join(__dirname, 'renderer.js'), 'utf8')
const rendererCSS = fs.readFileSync(join(__dirname, 'style.css'), 'utf8')

whenDomReady().then(() => {
  appendLoading()

  const script = document.createElement('script')
  script.type = 'module'
  // Without a sourceURL this shows up as an anonymous `VM<n>` script, so every
  // stack trace from our own overlay is unreadable in DevTools.
  script.innerHTML = `${rendererJS}\n//# sourceURL=chatguessr-renderer.js\n`
  document.body.appendChild(script)

  const css = document.createElement('style')
  css.textContent = rendererCSS
  document.body.appendChild(css)
})

window.onmessage = (ev: MessageEvent) => {
  ev.data.payload === 'removeLoading' && removeLoading()
}
setTimeout(removeLoading, 4999)

// Expose protected methods off of window in order to use ipcRenderer
// without exposing the entire object
contextBridge.exposeInMainWorld('chatguessrApi', chatguessrApi)
