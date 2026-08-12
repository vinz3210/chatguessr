import type { BrowserWindow } from 'electron'
import { initUserscripts } from './manager'
import registerUserscriptIpc from './ipc'

/**
 * Sets up Tampermonkey-compatible userscript support: loads the installed
 * scripts from `<userData>/userscripts` and registers the IPC surface the
 * preload (injection, GM APIs) and settings UI (install, toggle, update) use.
 */
export default function useScripts(userDataPath: string, window: BrowserWindow) {
  initUserscripts(userDataPath)
  registerUserscriptIpc(window)
}

export { getUserscriptsDir, listUserscripts } from './manager'
