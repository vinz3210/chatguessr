<template>
  <Teleport v-if="enabled && panoramaRoot" :to="panoramaRoot">
    <div class="cg-ai-overlay">
      <section class="cg-ai-overlay__card" aria-live="polite">
        <header class="cg-ai-overlay__header">
          <span class="cg-ai-overlay__title">AI description</span>
          <span class="cg-ai-overlay__tools">
            <span v-if="heading !== null" class="cg-ai-overlay__facing">
              <span class="cg-ai-overlay__needle" :style="{ transform: `rotate(${heading}deg)` }"
                >▲</span
              >
              Facing {{ compassPoint(heading) }} · {{ heading }}°
            </span>
            <SpeakButton
              v-if="ttsEnabled && status === 'done'"
              :state="speechStateOf('description')"
              @click="toggleSpeech('description', descriptionForSpeech())"
            />
          </span>
        </header>

        <div ref="body" class="cg-ai-overlay__body">
          <template v-if="status === 'done'">
            <p class="cg-ai-overlay__text">{{ text }}</p>
            <p v-if="summary" class="cg-ai-overlay__summary">{{ summary }}</p>

            <div v-if="chat.length > 0 || asking" class="cg-ai-overlay__chat">
              <div
                v-for="(message, index) of chat"
                :key="index"
                :class="['cg-ai-overlay__message', message.role]"
              >
                <p>{{ message.content }}</p>
                <SpeakButton
                  v-if="ttsEnabled && message.role === 'assistant'"
                  small
                  :state="speechStateOf(`answer-${index}`)"
                  @click="toggleSpeech(`answer-${index}`, message.content)"
                />
              </div>
              <div v-if="asking" class="cg-ai-overlay__message assistant">
                <p class="cg-ai-overlay__thinking">Thinking…</p>
              </div>
            </div>
          </template>
          <div v-else-if="status === 'error'" class="cg-ai-overlay__error">
            <p>{{ error }}</p>
            <button class="btn bg-primary" @click="describeRound(true)">Try again</button>
          </div>
          <p v-else class="cg-ai-overlay__pending">{{ pendingMessages[status] }}</p>
        </div>

        <p v-if="chatError || speechError" class="cg-ai-overlay__problem">
          {{ chatError || speechError }}
        </p>

        <!-- Key events stop here: the panorama around this box still has Street View's
             arrow-key and +/- controls, and GeoGuessr its own shortcuts. -->
        <form
          v-if="status === 'done'"
          class="cg-ai-overlay__ask"
          @submit.prevent="ask()"
          @keydown.stop
          @keyup.stop
          @keypress.stop
        >
          <input
            v-model="question"
            type="text"
            maxlength="300"
            spellcheck="false"
            autocomplete="off"
            placeholder="Ask about this location…"
            :disabled="asking"
          />
          <button type="submit" class="btn bg-primary" :disabled="asking || !question.trim()">
            Ask
          </button>
        </form>

        <footer v-if="model && status !== 'waiting'" class="cg-ai-overlay__model">
          {{ model }}
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useStyleTag } from '@vueuse/core'
import { captureRoundPanorama, findPanoramaRoot } from '../panoramaCapture'
import { forgetSpokenAudio, speak, type SpeechState } from '../speech'
import SpeakButton from './ui/SpeakButton.vue'

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
const summary = shallowRef('')
const error = shallowRef('')
const heading = shallowRef<number | null>(null)

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const COMPASS_NAMES = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west'
]
const normalizeHeading = (value: number) => ((Math.round(value) % 360) + 360) % 360
const compassPoint = (value: number) => COMPASS_POINTS[Math.round(value / 45) % 8]

// Read-aloud, only ever started by clicking a speaker button. One thing speaks at a time: the
// description ('description') or an answer ('answer-<index>').
const ttsEnabled = shallowRef(false)
const speakingKey = shallowRef<string | null>(null)
const speech = shallowRef<SpeechState>('idle')
const speechError = shallowRef('')
let stopSpeech: (() => void) | null = null

const speechStateOf = (key: string): SpeechState =>
  speakingKey.value === key ? speech.value : 'idle'

const descriptionForSpeech = () =>
  (heading.value === null ? '' : `Facing ${COMPASS_NAMES[Math.round(heading.value / 45) % 8]}. `) +
  text.value

function toggleSpeech(key: string, spokenText: string) {
  if (speechStateOf(key) !== 'idle') {
    stopSpeech?.()
    return
  }
  speechError.value = ''
  speakingKey.value = key
  stopSpeech = speak(spokenText, (state, err) => {
    // Starting this stopped whatever spoke before; that one's 'idle' is not ours to report.
    if (speakingKey.value !== key) return
    speech.value = state
    if (err) speechError.value = err
  })
}

function stopSpeaking() {
  stopSpeech?.()
  stopSpeech = null
  speechError.value = ''
}
onBeforeUnmount(stopSpeaking)

// Follow-up questions about the round. The conversation lives in the main process next to the
// captured image, so it survives a page reload.
const chat = shallowRef<AiChatMessage[]>([])
const question = shallowRef('')
const asking = shallowRef(false)
const chatError = shallowRef('')
const body = shallowRef<HTMLElement | null>(null)

const scrollToEnd = () =>
  nextTick(() => {
    if (body.value) body.value.scrollTop = body.value.scrollHeight
  })

function resetChat() {
  chat.value = []
  question.value = ''
  asking.value = false
  chatError.value = ''
}

async function ask() {
  const asked = question.value.trim()
  if (!asked || asking.value) return
  const run = runId
  asking.value = true
  chatError.value = ''
  question.value = ''
  chat.value = [...chat.value, { role: 'user', content: asked }]
  scrollToEnd()

  const result = await chatguessrApi.askAboutPanorama(asked)
  // The round moved on while the model was thinking.
  if (run !== runId) return
  asking.value = false
  if (result.ok) {
    chat.value = [...chat.value, { role: 'assistant', content: result.answer }]
  } else {
    // Take the question back so it can be sent again.
    chat.value = chat.value.slice(0, -1)
    question.value = asked
    chatError.value = result.error
  }
  scrollToEnd()
}

let voiceSetup = ''
async function loadSettings() {
  const settings = await chatguessrApi.getSettings()
  // A replay reuses the audio it already paid for, unless the voice has changed since.
  const setup = [settings.ttsProvider, settings.ttsModel, settings.ttsVoice].join('|')
  if (setup !== voiceSetup) forgetSpokenAudio()
  voiceSetup = setup
  enabled.value = settings.aiDescriptionMode
  model.value = settings.aiDescriptionModel
  ttsEnabled.value = settings.ttsEnabled
  if (!settings.ttsEnabled) stopSpeaking()
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
  stopSpeaking()
  resetChat()
  runId++
  describedKey = null
  status.value = 'waiting'
  heading.value = null
}

async function show(description: AiDescription, run: number) {
  text.value = description.text
  summary.value = description.summary ?? ''
  model.value = description.model
  heading.value = description.heading
  status.value = 'done'
  // Picks up questions already asked this round, e.g. before a page reload.
  const history = await chatguessrApi.getAiChat()
  if (run !== runId) return
  chat.value = history
  scrollToEnd()
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
  stopSpeaking()
  resetChat()

  status.value = 'capturing'
  text.value = ''
  error.value = ''
  heading.value = null

  try {
    const cached = force ? null : await chatguessrApi.getCachedAiDescription()
    if (isCancelled()) return
    if (cached) return show(cached, run)

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
      await show(result.description, run)
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
    // The results screen gives the answer away anyway.
    else if (state !== 'in-round') stopSpeaking()
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
  display: flex;
  flex-direction: column;
  width: min(56rem, 100%);
  max-height: 100%;
  padding: 1.5rem 2rem;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}

.cg-ai-overlay__header {
  display: flex;
  flex-wrap: wrap;
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

.cg-ai-overlay__tools {
  display: inline-flex;
  align-items: center;
  gap: 1rem;
}

/* Only the description and conversation scroll; the header and question box stay put. */
.cg-ai-overlay__body {
  min-height: 0;
  overflow-y: auto;
}

.cg-ai-overlay__chat {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 1.25rem;
  padding-top: 1.25rem;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}

.cg-ai-overlay__message {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}
.cg-ai-overlay__message p {
  max-width: 85%;
  margin: 0;
  padding: 0.55rem 0.85rem;
  font-size: 1.1rem;
  line-height: 1.5;
  white-space: pre-wrap;
  border-radius: 10px;
}
.cg-ai-overlay__message.user {
  justify-content: flex-end;
}
.cg-ai-overlay__message.user p {
  background: rgba(89, 243, 179, 0.14);
  border: 1px solid rgba(89, 243, 179, 0.35);
  border-bottom-right-radius: 2px;
}
.cg-ai-overlay__message.assistant p {
  background: rgba(255, 255, 255, 0.08);
  border-bottom-left-radius: 2px;
}

.cg-ai-overlay__thinking {
  color: rgba(255, 255, 255, 0.7);
  animation: cg-ai-pulse 1.6s ease-in-out infinite;
}

.cg-ai-overlay__problem {
  margin: 0.75rem 0 0;
  font-size: 0.95rem;
  color: var(--danger);
}

.cg-ai-overlay__ask {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}
.cg-ai-overlay__ask input {
  flex: 1;
  min-width: 0;
  padding: 0.6rem 0.85rem;
  font: inherit;
  font-size: 1rem;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  outline: none;
}
.cg-ai-overlay__ask input:focus {
  border-color: var(--primary);
}
.cg-ai-overlay__ask input::placeholder {
  color: rgba(255, 255, 255, 0.45);
}
.cg-ai-overlay__ask .btn {
  padding: 0 1.1rem;
  font-weight: 700;
  border: none;
  border-radius: 8px;
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

.cg-ai-overlay__summary {
  margin: 1rem 0 0;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 1.15rem;
  line-height: 1.5;
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
