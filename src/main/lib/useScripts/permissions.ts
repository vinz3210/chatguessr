import fs from 'fs'
import { join } from 'path'
import { dialog, BrowserWindow } from 'electron'
import { getConnects, getUserscriptsDir } from './manager'

// Tampermonkey gates GM_xmlhttpRequest on the script's @connect list and asks
// the user about anything else. We do the same, remembering the answer per
// (script, host) pair in permissions.json.

type Permissions = Record<string, Record<string, boolean>>

let permissions: Permissions = {}
let loaded = false

/** Hosts every script may reach without asking — the site the app is built around. */
const IMPLICIT_HOSTS = ['geoguessr.com', 'chatguessr.com', 'maps.googleapis.com', 'google.com']

const permissionsPath = () => join(getUserscriptsDir(), 'permissions.json')

function load() {
  if (loaded) return
  loaded = true
  try {
    const parsed = JSON.parse(fs.readFileSync(permissionsPath(), 'utf8'))
    if (parsed && typeof parsed === 'object') permissions = parsed
  } catch {
    permissions = {}
  }
}

function save() {
  try {
    fs.writeFileSync(permissionsPath(), JSON.stringify(permissions, null, 2))
  } catch (err) {
    console.error('[userscripts] failed to persist connect permissions', err)
  }
}

const hostMatches = (host: string, rule: string) =>
  host === rule || host.endsWith(`.${rule}`) || rule === '*'

/** Pending prompts, so a script firing 20 requests at once only asks once. */
const pending = new Map<string, Promise<boolean>>()

export async function canConnect(
  parentWindow: BrowserWindow,
  scriptId: string,
  scriptName: string,
  url: string
): Promise<boolean> {
  load()

  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return false
  }

  if (IMPLICIT_HOSTS.some((rule) => hostMatches(host, rule))) return true
  if (getConnects(scriptId).some((rule) => hostMatches(host, rule.replace(/^\*\./, ''))))
    return true

  const remembered = permissions[scriptId]?.[host]
  if (remembered !== undefined) return remembered

  const key = `${scriptId}\n${host}`
  const existing = pending.get(key)
  if (existing) return existing

  const prompt = dialog
    .showMessageBox(parentWindow, {
      type: 'question',
      title: 'Userscript network request',
      message: `"${scriptName}" wants to send a request to ${host}`,
      detail:
        "This domain is not listed in the script's @connect metadata. Only allow it if you trust the script.",
      buttons: ['Deny', 'Allow once', 'Always allow'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    .then(({ response }) => {
      if (response === 2) {
        permissions[scriptId] = { ...permissions[scriptId], [host]: true }
        save()
      }
      return response !== 0
    })
    .finally(() => {
      pending.delete(key)
    })

  pending.set(key, prompt)
  return prompt
}

export function clearPermissions(scriptId: string) {
  load()
  if (!permissions[scriptId]) return
  delete permissions[scriptId]
  save()
}
