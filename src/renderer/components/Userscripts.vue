<template>
  <div>
    <div class="warning-box mb-1">
      <strong>⚠️ Userscripts run with full access to this page.</strong>
      They can read and change anything on GeoGuessr while you are logged in, and they can call
      ChatGuessr's own API. Only install scripts you trust.
    </div>

    <div class="form__group">
      <div class="flex gap-03 w-full">
        <input
          v-model.trim="newScriptUrl"
          type="text"
          spellcheck="false"
          placeholder="https://greasyfork.org/scripts/…/code/script.user.js"
          class="flex-1"
          @keyup.enter="installFromUrl()"
        />
        <button class="btn bg-primary" :disabled="busy || !newScriptUrl" @click="installFromUrl()">
          Install from URL
        </button>
        <button class="btn bg-primary" :disabled="busy" @click="installFromFile()">
          Install from file
        </button>
      </div>
    </div>

    <p v-if="message" :class="['message', messageKind]">{{ message }}</p>

    <h3>Installed scripts ({{ scripts.length }})</h3>

    <p v-if="scripts.length === 0" class="empty">
      No userscripts installed yet. Tampermonkey scripts (<code>.user.js</code>) work as-is.
    </p>

    <div v-for="script of scripts" :key="script.id" class="script">
      <div class="script__head">
        <label class="script__toggle" :data-tip="script.enabled ? 'Disable' : 'Enable'">
          <input
            type="checkbox"
            :checked="script.enabled"
            @change="toggle(script, ($event.target as HTMLInputElement).checked)"
          />
        </label>
        <div class="script__title">
          <span class="script__name">{{ script.meta.name }}</span>
          <span class="script__version">v{{ script.meta.version }}</span>
          <span v-if="script.meta.author" class="script__author">by {{ script.meta.author }}</span>
        </div>
        <div class="flex gap-03">
          <button
            class="btn bg-primary"
            :disabled="busy || !canUpdate(script)"
            :data-tip="canUpdate(script) ? 'Re-download from @downloadURL' : 'No @downloadURL'"
            @click="update(script)"
          >
            Update
          </button>
          <button class="btn bg-danger" :disabled="busy" @click="remove(script)">Remove</button>
        </div>
      </div>

      <p v-if="script.meta.description" class="script__description">
        {{ script.meta.description }}
      </p>

      <div class="script__meta">
        <span class="tag">{{ script.meta.runAt }}</span>
        <span v-for="pattern of patternsOf(script)" :key="pattern" class="tag">{{ pattern }}</span>
        <span v-if="script.meta.grants === null" class="tag">no @grant (all APIs)</span>
        <span v-for="grant of script.meta.grants ?? []" :key="grant" class="tag">{{ grant }}</span>
      </div>

      <p v-for="error of script.assetErrors" :key="error" class="message error">
        Failed to download {{ error }}
      </p>
    </div>

    <div class="flex items-center flex-col gap-05 mt-1">
      <button class="btn bg-warning" @click="chatguessrApi.openUserscriptsFolder()">
        Open scripts folder
      </button>
      <small>Changes apply on the next page load — reload GeoGuessr after installing.</small>
    </div>

    <Modal :is-visible="reloadNotice !== ''" @close="reloadNotice = ''">
      <div class="reload-modal">
        <h2>Reload required</h2>
        <p>{{ reloadNotice }}</p>
        <p>
          Userscripts are injected when the page loads, so press
          <kbd>Ctrl</kbd> + <kbd>R</kbd> to reload GeoGuessr and apply the change.
        </p>
        <button class="btn bg-primary" @click="reloadNotice = ''">Got it</button>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import Modal from './ui/Modal.vue'

const { chatguessrApi } = window

const scripts = ref<UserscriptInfo[]>(await chatguessrApi.getUserscripts())
const newScriptUrl = shallowRef('')
const busy = shallowRef(false)
const message = shallowRef('')
const messageKind = shallowRef<'error' | 'success'>('success')
const reloadNotice = shallowRef('')

const refresh = async () => {
  scripts.value = await chatguessrApi.getUserscripts()
}

const notify = (text: string, kind: 'error' | 'success' = 'success') => {
  message.value = text
  messageKind.value = kind
}

/** Anything that changes which scripts run only takes effect on the next load. */
const notifyReloadNeeded = (text: string) => {
  notify(text)
  reloadNotice.value = text
}

const canUpdate = (script: UserscriptInfo) =>
  Boolean(script.meta.downloadUrl ?? script.meta.updateUrl ?? script.origin.url)

const patternsOf = (script: UserscriptInfo) => [...script.meta.matches, ...script.meta.includes]

async function withBusy(action: () => Promise<void>) {
  busy.value = true
  message.value = ''
  try {
    await action()
  } finally {
    busy.value = false
  }
}

const handleInstall = (result: UserscriptInstallResult) => {
  if (result.ok && result.script) {
    notifyReloadNeeded(`Installed ${result.script.meta.name} v${result.script.meta.version}.`)
  } else if (result.error) {
    notify(result.error, 'error')
  }
}

const installFromUrl = () =>
  withBusy(async () => {
    const url = newScriptUrl.value
    if (!url) return

    handleInstall(await chatguessrApi.installUserscriptFromUrl(url))
    newScriptUrl.value = ''
    await refresh()
  })

const installFromFile = () =>
  withBusy(async () => {
    handleInstall(await chatguessrApi.installUserscriptFromFile())
    await refresh()
  })

const toggle = (script: UserscriptInfo, enabled: boolean) =>
  withBusy(async () => {
    await chatguessrApi.setUserscriptEnabled(script.id, enabled)
    await refresh()
    notifyReloadNeeded(`${script.meta.name} ${enabled ? 'enabled' : 'disabled'}.`)
  })

const remove = (script: UserscriptInfo) =>
  withBusy(async () => {
    await chatguessrApi.removeUserscript(script.id)
    await refresh()
    notifyReloadNeeded(`Removed ${script.meta.name}.`)
  })

const update = (script: UserscriptInfo) =>
  withBusy(async () => {
    const result = await chatguessrApi.updateUserscript(script.id)
    if (!result.ok) {
      notify(result.error ?? 'Update failed', 'error')
      return
    }

    await refresh()
    if (result.updated) {
      notifyReloadNeeded(`${script.meta.name} updated to v${result.version}.`)
    } else {
      notify(`${script.meta.name} is already up to date.`)
    }
  })
</script>

<style scoped>
.warning-box {
  padding: 0.6rem 0.8rem;
  border-radius: 5px;
  border-left: 3px solid var(--warning);
  background: rgb(255 174 0 / 12%);
  line-height: 1.4;
}

.empty {
  opacity: 0.7;
  font-style: italic;
}

.message {
  margin: 0.5rem 0;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  background: rgb(255 255 255 / 8%);
}
.message.error {
  color: var(--danger);
}
.message.success {
  color: var(--primary);
}

.script {
  padding: 0.6rem 0.8rem;
  margin-bottom: 0.6rem;
  border-radius: 5px;
  background: rgb(255 255 255 / 6%);
}

.script__head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.script__toggle {
  display: flex;
}

.script__title {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  flex: 1;
  min-width: 0;
}

.script__name {
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.script__version,
.script__author {
  font-size: 0.8rem;
  opacity: 0.7;
}

.script__description {
  margin: 0.4rem 0 0;
  opacity: 0.85;
}

.script__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.5rem;
}

.tag {
  padding: 0.1rem 0.4rem;
  font-size: 0.75rem;
  border-radius: 3px;
  background: rgb(255 255 255 / 10%);
  word-break: break-all;
}

.reload-modal {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  max-width: 26rem;
  text-align: center;
  line-height: 1.5;
}

.reload-modal h2 {
  margin: 0;
  color: var(--primary);
}

.reload-modal p {
  margin: 0;
}

.reload-modal kbd {
  padding: 0.1rem 0.35rem;
  font-family: monospace;
  font-size: 0.85em;
  border: 1px solid rgb(255 255 255 / 35%);
  border-radius: 3px;
  background: rgb(255 255 255 / 12%);
}

.reload-modal .btn {
  margin-top: 0.5rem;
  min-width: 6rem;
}
</style>
