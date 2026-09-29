<template>
  <div>
    <p class="intro">
      Adds a speaker button to AI descriptions that reads them out in your own voice. It runs
      entirely on this computer and keeps about two CPU cores busy while it speaks.
    </p>

    <label class="form__group" data-tip="Off by default because of the CPU it uses while speaking">
      Read AI descriptions aloud
      <input v-model="enabled" type="checkbox" />
    </label>

    <h3>1. Voice model</h3>
    <div v-if="status.modelReady" class="row"><span class="ok">✓ Downloaded</span></div>
    <div v-else-if="status.download" class="row">
      <progress :value="status.download.received" :max="status.download.total" />
      <span>{{ percent(status.download) }}%</span>
    </div>
    <div v-else class="row">
      <span>Pocket TTS, about {{ MODEL_MEGABYTES }} MB, downloaded once.</span>
      <button class="btn bg-primary" :disabled="busy" @click="downloadModel()">Download</button>
    </div>

    <h3>2. Your voice</h3>
    <div v-if="status.voiceSeconds" class="row">
      <span class="ok">✓ Voice saved ({{ status.voiceSeconds.toFixed(1) }} s)</span>
      <button class="btn bg-danger" :disabled="busy" @click="removeVoice()">Remove</button>
    </div>

    <div v-if="recording" class="recording">
      <p class="hint">Read this out loud, the way you talk on stream:</p>
      <p class="script">{{ SCRIPT }}</p>
      <div class="row">
        <div class="level"><div class="level__bar" :style="{ width: `${level * 100}%` }" /></div>
        <span>{{ elapsed.toFixed(0) }} / {{ MAX_RECORDING_SECONDS }} s</span>
        <button class="btn bg-danger" @click="stopRecording()">■ Stop</button>
      </div>
    </div>

    <div v-else-if="clip" class="row">
      <span>Clip ready ({{ (clip.length / VOICE_SAMPLE_RATE).toFixed(1) }} s)</span>
      <button class="btn" @click="previewClip()">▶ Listen</button>
      <button class="btn bg-primary" :disabled="busy" @click="saveClip()">Save as my voice</button>
      <button class="btn bg-danger" @click="clip = null">Discard</button>
    </div>

    <template v-else>
      <label class="consent">
        <input v-model="consent" type="checkbox" />
        This is my own voice. Only clone someone's voice with their permission.
      </label>
      <div class="row">
        <button class="btn bg-primary" :disabled="!consent || busy" @click="startRecording()">
          ● Record
        </button>
        <button class="btn bg-primary" :disabled="!consent || busy" @click="fileInput?.click()">
          Import clip
        </button>
        <input ref="fileInput" type="file" accept="audio/*" hidden @change="importClip" />
      </div>
      <p class="hint">
        Use a quiet room and your normal streaming voice. The clip's sound quality carries over, so
        a clean bit of a past stream works as well as a fresh recording.
      </p>
    </template>

    <h3>3. Try it</h3>
    <div class="row">
      <input v-model="testText" type="text" spellcheck="false" class="flex-1" />
      <button class="btn bg-primary" :disabled="!canSpeak" @click="toggleTest()">
        {{
          testState === 'idle' ? '▶ Say it' : testState === 'loading' ? 'Generating… ■' : '■ Stop'
        }}
      </button>
    </div>
    <p v-if="!canSpeak" class="hint">
      Turn on "Read AI descriptions aloud" and finish steps 1 and 2 first.
    </p>

    <p v-if="message" :class="['message', messageKind]">{{ message }}</p>

    <p class="credits">
      Voice model: Pocket TTS by Kyutai (CC-BY-4.0), run locally with sherpa-onnx.
    </p>
  </div>
</template>

<script setup lang="ts">
// Setup for the local Pocket TTS voice (cloned from the streamer's own recording). Only shown when
// `ttsProvider` is 'local', which nothing in the UI sets yet; see useTts.ts.
import { computed, onBeforeUnmount, shallowRef } from 'vue'
import { decodeToMono, prepareVoiceClip, VOICE_SAMPLE_RATE } from '../voiceClip'
import { speak, type SpeechState } from '../speech'

const { chatguessrApi } = window

const enabled = defineModel<boolean>('enabled', { required: true })

const MODEL_MEGABYTES = 220
const MAX_RECORDING_SECONDS = 20
// About 15 seconds read aloud: varied sounds, and lively enough to carry the streaming voice.
const SCRIPT =
  "Alright chat, let's figure out where we are. The road is wide and freshly paved, with a " +
  'dashed white line down the middle. There are palm trees on the left, a big blue sign up ' +
  "ahead, and the sun is sitting low behind the hills. I've got a good feeling about this " +
  "one, so let's lock it in!"

const status = shallowRef<TtsStatus>(await chatguessrApi.getTtsStatus())
const busy = shallowRef(false)
const message = shallowRef('')
const messageKind = shallowRef<'error' | 'success'>('success')

const say = (text: string, kind: 'error' | 'success') => {
  message.value = text
  messageKind.value = kind
}
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))
const percent = ({ received, total }: { received: number; total: number }) =>
  Math.floor((received / total) * 100)

onBeforeUnmount(
  chatguessrApi.onTtsDownloadProgress(async (progress) => {
    status.value = progress
      ? { ...status.value, download: progress }
      : await chatguessrApi.getTtsStatus()
  })
)

async function downloadModel() {
  busy.value = true
  message.value = ''
  status.value = { ...status.value, download: { received: 0, total: 1 } }
  const result = await chatguessrApi.downloadTtsModel()
  status.value = await chatguessrApi.getTtsStatus()
  busy.value = false
  if (!result.ok) say(result.error, 'error')
}

async function removeVoice() {
  status.value = await chatguessrApi.deleteTtsVoice()
}

// Recording -------------------------------------------------------------------------------

const consent = shallowRef(false)
const recording = shallowRef(false)
const elapsed = shallowRef(0)
const level = shallowRef(0)
// The cleaned-up clip waiting to be saved: mono at VOICE_SAMPLE_RATE.
const clip = shallowRef<Float32Array | null>(null)
const fileInput = shallowRef<HTMLInputElement | null>(null)

let recorder: MediaRecorder | null = null
let microphone: MediaStream | null = null
let meterContext: AudioContext | null = null
let meterFrame = 0
let recordingTimer: ReturnType<typeof setInterval> | undefined

async function useClip(data: ArrayBuffer) {
  try {
    clip.value = prepareVoiceClip(await decodeToMono(data), VOICE_SAMPLE_RATE)
    message.value = ''
  } catch (err) {
    say(
      err instanceof DOMException ? 'Could not read that file. Try a WAV or MP3.' : errorText(err),
      'error'
    )
  }
}

async function startRecording() {
  message.value = ''
  try {
    // No echo cancellation or gain riding: the clone should hear the voice as it is.
    microphone = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, autoGainControl: false, noiseSuppression: true }
    })
  } catch (err) {
    say(`Could not open the microphone: ${errorText(err)}`, 'error')
    return
  }

  const parts: Blob[] = []
  recorder = new MediaRecorder(microphone)
  recorder.ondataavailable = (event) => parts.push(event.data)
  recorder.onstop = async () => {
    releaseMicrophone()
    await useClip(await new Blob(parts).arrayBuffer())
  }
  recorder.start()
  recording.value = true

  meterContext = new AudioContext()
  const analyser = meterContext.createAnalyser()
  analyser.fftSize = 1024
  meterContext.createMediaStreamSource(microphone).connect(analyser)
  const frame = new Float32Array(analyser.fftSize)
  const measure = () => {
    analyser.getFloatTimeDomainData(frame)
    let peak = 0
    for (const sample of frame) peak = Math.max(peak, Math.abs(sample))
    level.value = Math.min(1, peak * 1.5)
    meterFrame = requestAnimationFrame(measure)
  }
  measure()

  const startedAt = Date.now()
  elapsed.value = 0
  recordingTimer = setInterval(() => {
    elapsed.value = (Date.now() - startedAt) / 1000
    if (elapsed.value >= MAX_RECORDING_SECONDS) stopRecording()
  }, 200)
}

function stopRecording() {
  recording.value = false
  clearInterval(recordingTimer)
  cancelAnimationFrame(meterFrame)
  if (recorder?.state === 'recording') recorder.stop()
}

function releaseMicrophone() {
  microphone?.getTracks().forEach((track) => track.stop())
  microphone = null
  void meterContext?.close()
  meterContext = null
  level.value = 0
}

async function importClip(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) await useClip(await file.arrayBuffer())
}

let previewContext: AudioContext | undefined
function previewClip() {
  if (!clip.value) return
  previewContext ??= new AudioContext({ sampleRate: VOICE_SAMPLE_RATE })
  const buffer = previewContext.createBuffer(1, clip.value.length, VOICE_SAMPLE_RATE)
  buffer.copyToChannel(clip.value, 0)
  const source = previewContext.createBufferSource()
  source.buffer = buffer
  source.connect(previewContext.destination)
  source.start()
}

async function saveClip() {
  if (!clip.value) return
  busy.value = true
  try {
    status.value = await chatguessrApi.saveTtsVoice(clip.value, VOICE_SAMPLE_RATE)
    clip.value = null
    say('Voice saved. Try it below.', 'success')
  } catch (err) {
    say(`Could not save the voice: ${errorText(err)}`, 'error')
  } finally {
    busy.value = false
  }
}

// Testing ---------------------------------------------------------------------------------

const testText = shallowRef("Hello chat! Let's find out where in the world we are this time.")
const testState = shallowRef<SpeechState>('idle')
const canSpeak = computed(
  () => enabled.value && status.value.modelReady && !!status.value.voiceSeconds
)
let stopTest: (() => void) | null = null

function toggleTest() {
  if (testState.value !== 'idle') {
    stopTest?.()
    return
  }
  message.value = ''
  stopTest = speak(
    testText.value,
    (state, error) => {
      testState.value = state
      if (error) say(error, 'error')
    },
    // A re-recorded voice should be heard, not the last clip.
    { reuse: false }
  )
}

onBeforeUnmount(() => {
  stopTest?.()
  stopRecording()
  releaseMicrophone()
  void previewContext?.close()
})
</script>

<style scoped>
.intro {
  line-height: 1.4;
  opacity: 0.85;
}

h3 {
  margin: 1rem 0 0.5rem;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 28px;
}

.row progress {
  width: 320px;
}

.ok {
  color: var(--primary);
}

.consent {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.hint {
  font-size: 0.85rem;
  opacity: 0.7;
}

.recording {
  padding: 0.6rem 0.8rem;
  border-radius: 5px;
  background: rgb(255 255 255 / 6%);
}

.script {
  font-size: 1.1rem;
  line-height: 1.5;
}

.level {
  width: 200px;
  height: 8px;
  border-radius: 4px;
  background: rgb(255 255 255 / 15%);
  overflow: hidden;
}

.level__bar {
  height: 100%;
  background: var(--primary);
  transition: width 0.05s linear;
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

.credits {
  margin-top: 1.5rem;
  font-size: 0.75rem;
  opacity: 0.5;
}
</style>
