<template>
  <div v-if="commands.length > 0" class="cg-userscript-menu">
    <h3>Userscript commands</h3>
    <div class="flex flex-wrap gap-03">
      <button
        v-for="command of commands"
        :key="command.id"
        class="btn bg-primary"
        :title="`${command.scriptName} — ${command.caption}`"
        @click="run(command)"
      >
        {{ command.caption }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, shallowRef } from 'vue'

// GM_registerMenuCommand pushes into a registry on `window` (both the userscript
// runtime and this overlay live in GeoGuessr's main world) and fires an event
// whenever it changes.

type MenuCommand = {
  id: number
  scriptId: string
  scriptName: string
  caption: string
  accessKey?: string
  run: () => void
}

const registry = () =>
  (window as unknown as { __chatguessrUserscriptMenu?: { commands: MenuCommand[] } })
    .__chatguessrUserscriptMenu

const commands = shallowRef<MenuCommand[]>([...(registry()?.commands ?? [])])

const sync = () => {
  commands.value = [...(registry()?.commands ?? [])]
}

const run = (command: MenuCommand) => {
  try {
    command.run()
  } catch (err) {
    console.error(`[userscript] menu command "${command.caption}" failed`, err)
  }
}

window.addEventListener('cg-userscript-menu-changed', sync)
onUnmounted(() => window.removeEventListener('cg-userscript-menu-changed', sync))
</script>

<style scoped>
.cg-userscript-menu {
  margin-top: 0.5rem;
}
</style>
