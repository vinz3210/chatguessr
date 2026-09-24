<template>
  <Teleport v-if="enabled && panoramaRoot" :to="panoramaRoot">
    <div class="cg-ai-overlay">
      <section class="cg-ai-overlay__card" aria-live="polite">
        <header class="cg-ai-overlay__header">
          <span class="cg-ai-overlay__title">AI description</span>
          <span v-if="heading !== null" class="cg-ai-overlay__facing">
            <span class="cg-ai-overlay__needle" :style="{ transform: `rotate(${heading}deg)` }"
              >▲</span
            >
            Facing {{ compassPoint(heading) }} · {{ heading }}°
          </span>
        </header>

        <p v-if="status === 'done'" class="cg-ai-overlay__text">{{ text }}</p>
        <div v-else-if="status === 'error'" class="cg-ai-overlay__error">
          <p>{{ error }}</p>
          <button class="btn bg-primary" @click="describeRound(true)">Try again</button>
        </div>
        <p v-else class="cg-ai-overlay__pending">{{ pendingMessages[status] }}</p>

        <footer v-if="model && status !== 'waiting'" class="cg-ai-overlay__model">
          {{ model }}
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, shallowRef, watch } from 'vue'
import { useStyleTag } from '@vueuse/core'
import { captureRoundPanorama, findPanoramaRoot } from '../panoramaCapture'

const { chatguessrApi } = window

const props = defineProps<{
  gameState: GameState
  settingsVisible: boolean
  getStreetView: () => google.maps.StreetViewPanorama | undefined
}>()

type Status = 'waiting' | 'capturing' | 'describing' | 'done' | 'error'

const pendingMessages: Record<Status, string> = {
  waiting: 'Waiting for the round to start…',
  capturing: 'Taking a look around…',
  describing: 'Writing the description…',
  done: '',
  error: ''
}

const enabled = shallowRef(false)
const model = shallowRef('')
const status = shallowRef<Status>('waiting')
const text = shallowRef('')
const error = shallowRef('')
const heading = shallowRef<number | null>(null)

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const normalizeHeading = (value: number) => ((Math.round(value) % 360) + 360) % 360
const compassPoint = (value: number) => COMPASS_POINTS[Math.round(value / 45) % 8]

async function loadSettings() {
  const settings = await chatguessrApi.getSettings()
  enabled.value = settings.aiDescriptionMode
  model.value = settings.aiDescriptionModel
}
loadSettings()
watch(
  () => props.settingsVisible,
  (visible) => {
    if (!visible) loadSettings()
  }
)

// Hide the panorama with CSS instead of relying on the overlay alone: the overlay can only be
// placed once GeoGuessr has created the panorama element, CSS applies from the first frame.
const panoramaHider = useStyleTag(
  `
  [data-qa="panorama"] { isolation: isolate; }
  [data-qa="panorama"] > :not(.cg-ai-overlay) { opacity: 0 !important; pointer-events: none !important; }
  [data-qa="compass"], [class^="panorama-compass_"] { display: none !important; }
  `,
  { id: 'cg-ai-description-hider', manual: true }
)

// GeoGuessr recreates the panorama element between games, so keep following it.
const panoramaRoot = shallowRef<HTMLElement | null>(null)
function trackPanoramaRoot() {
  const root = findPanoramaRoot()
  if (root === panoramaRoot.value) return
  if (root && getComputedStyle(root).position === 'static') root.style.position = 'relative'
  panoramaRoot.value = root
}
const rootObserver = new MutationObserver(trackPanoramaRoot)
onBeforeUnmount(() => rootObserver.disconnect())

let runId = 0
let describedKey: string | null = null

function cancelRun() {
  runId++
  describedKey = null
  status.value = 'waiting'
  heading.value = null
}

function show(description: AiDescription) {
  text.value = description.text
  model.value = description.model
  heading.value = description.heading
  status.value = 'done'
}

function fail(message: string) {
  error.value = message
  status.value = 'error'
}

async function describeRound(force = false) {
  if (!enabled.value) return
  const location = await chatguessrApi.getCurrentLocation().catch(() => null)
  if (!location || !enabled.value || props.gameState !== 'in-round') return

  // Round events fire repeatedly (e.g. on every frame load); only start once per location.
  const key = `${location.lat},${location.lng}`
  if (!force && key === describedKey) return
  describedKey = key
  const run = ++runId
  const isCancelled = () => run !== runId

  status.value = 'capturing'
  text.value = ''
  error.value = ''
  heading.value = null

  try {
    const cached = force ? null : await chatguessrApi.getCachedAiDescription()
    if (isCancelled()) return
    if (cached) return show(cached)

    const capture = await captureRoundPanorama({
      streetView: props.getStreetView,
      location,
      isCancelled
    })
    if (!capture || isCancelled()) return

    heading.value = normalizeHeading(capture.heading)
    status.value = 'describing'
    const result = await chatguessrApi.describePanorama(capture)
    if (isCancelled()) return
    if (result.ok) {
      show(result.description)
    } else {
      fail(result.error)
    }
  } catch (err) {
    if (!isCancelled()) fail(err instanceof Error ? err.message : String(err))
  }
}

watch(
  enabled,
  (on) => {
    if (on) {
      panoramaHider.load()
      trackPanoramaRoot()
      rootObserver.observe(document.body, { childList: true, subtree: true })
    } else {
      panoramaHider.unload()
      rootObserver.disconnect()
      panoramaRoot.value = null
      cancelRun()
    }
  },
  { immediate: true }
)

watch(
  () => enabled.value && props.gameState === 'in-round',
  (active) => {
    if (active) describeRound()
  }
)
watch(
  () => props.gameState,
  (state) => {
    if (state === 'none') cancelRun()
  }
)

// The game state doesn't always change between rounds, so listen for round events directly too.
onBeforeUnmount(chatguessrApi.onStartRound(() => describeRound()))
onBeforeUnmount(chatguessrApi.onRefreshRound(() => describeRound()))
</script>

<style scoped>
.cg-ai-overlay {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  /* The bottom padding keeps the text clear of the guess map in the corner. */
  padding: 5rem 2rem 16rem;
  color: #ffffff;
  background: radial-gradient(ellipse at 50% 35%, #1e1b3a 0%, #0c0b16 70%);
  pointer-events: auto;
}

.cg-ai-overlay__card {
  width: min(56rem, 100%);
  max-height: 100%;
  overflow-y: auto;
  padding: 1.5rem 2rem;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}

.cg-ai-overlay__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cg-ai-overlay__title {
  color: var(--primary);
}

.cg-ai-overlay__facing {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.cg-ai-overlay__needle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.6rem;
  height: 1.6rem;
  font-size: 0.7rem;
  color: var(--primary);
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 50%;
  transition: transform 0.3s;
}

.cg-ai-overlay__text {
  margin: 0;
  font-size: 1.3rem;
  line-height: 1.6;
  white-space: pre-wrap;
}

.cg-ai-overlay__pending {
  margin: 0;
  font-size: 1.2rem;
  color: rgba(255, 255, 255, 0.75);
  animation: cg-ai-pulse 1.6s ease-in-out infinite;
}

.cg-ai-overlay__error p {
  margin: 0 0 1rem;
  font-size: 1.1rem;
  color: var(--danger);
}

.cg-ai-overlay__model {
  margin-top: 1rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
}

@keyframes cg-ai-pulse {
  50% {
    opacity: 0.45;
  }
}
</style>
