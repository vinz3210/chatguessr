import fs from 'fs'
import { join } from 'path'
import { ipcMain, utilityProcess, type BrowserWindow, type UtilityProcess } from 'electron'
import { settings } from '../utils/useSettings'
import {
  MODEL_DIR_NAME,
  downloadModel,
  isModelDownloaded,
  pocketModelConfig
} from './pocketTtsModel'
import { encodeWav, wavDurationSeconds, WAV_HEADER_BYTES } from './wav'
import { speakableText } from './pocketText'
import type { TtsWorkerMessage, TtsWorkerRequest } from './messages'
import { store } from '../utils/store'
import {
  describeRequestError,
  fetchSpeechModels,
  splitForSpeech,
  synthesizeSpeech
} from '../utils/openRouter'

const PROGRESS_INTERVAL_MS = 200
// The worker holds a few hundred MB of model in memory; free it when nobody is listening.
const WORKER_IDLE_MS = 5 * 60_000
const MIN_VOICE_SECONDS = 3
const MAX_VOICE_SECONDS = 30
// The piece about to play plus two more, so each is ready before the one ahead of it ends.
const SPEECH_REQUESTS_IN_FLIGHT = 3

/**
 * Read-aloud for AI Description Mode. Two providers send audio to the renderer the same way
 * (`tts:chunk`, then `tts:done` or `tts:error`):
 * - OpenRouter speech models, with the same API key as the descriptions (the default).
 * - Pocket TTS running locally in a utility process, cloned from a clip of the streamer's voice.
 *   Hidden from the UI for now; the renderer records the clip, this side stores it, downloads
 *   the model and relays audio from the worker.
 */
export default function useTts(userDataPath: string, win: BrowserWindow) {
  const ttsDir = join(userDataPath, 'tts')
  const modelDir = join(ttsDir, MODEL_DIR_NAME)
  const voicePath = join(ttsDir, 'voice.wav')

  let download: Promise<void> | undefined
  let downloadProgress: { received: number; total: number } | null = null

  let worker: UtilityProcess | undefined
  let idleTimer: NodeJS.Timeout | undefined
  const activeIds = new Set<string>()

  const voiceSeconds = () => {
    try {
      const fd = fs.openSync(voicePath, 'r')
      try {
        const header = Buffer.alloc(WAV_HEADER_BYTES)
        fs.readSync(fd, header, 0, WAV_HEADER_BYTES, 0)
        return wavDurationSeconds(header)
      } finally {
        fs.closeSync(fd)
      }
    } catch {
      return null
    }
  }

  const status = (): TtsStatus => ({
    modelReady: !download && isModelDownloaded(modelDir),
    download: downloadProgress,
    voiceSeconds: voiceSeconds()
  })

  ipcMain.handle('tts:get-status', () => status())

  ipcMain.handle('tts:download-model', async (): Promise<TtsResult> => {
    let lastSent = 0
    download ??= downloadModel(modelDir, (received, total) => {
      downloadProgress = { received, total }
      const now = Date.now()
      if (now - lastSent >= PROGRESS_INTERVAL_MS || received === total) {
        lastSent = now
        win.webContents.send('tts:download-progress', downloadProgress)
      }
    }).finally(() => {
      download = undefined
      downloadProgress = null
      // Lets a settings window opened mid-download know to refresh.
      win.webContents.send('tts:download-progress', null)
    })

    try {
      await download
      return { ok: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      console.error('[tts] model download failed:', error)
      return { ok: false, error: `Download failed: ${error}` }
    }
  })

  ipcMain.handle('tts:save-voice', async (_event, samples: Float32Array, sampleRate: number) => {
    const seconds = samples.length / sampleRate
    if (
      !(samples instanceof Float32Array) ||
      !Number.isInteger(sampleRate) ||
      sampleRate < 8000 ||
      sampleRate > 96000 ||
      seconds < MIN_VOICE_SECONDS ||
      seconds > MAX_VOICE_SECONDS
    ) {
      throw new Error('Invalid voice clip')
    }
    await fs.promises.mkdir(ttsDir, { recursive: true })
    await fs.promises.writeFile(voicePath, encodeWav(samples, sampleRate))
    return status()
  })

  ipcMain.handle('tts:delete-voice', async () => {
    await fs.promises.rm(voicePath, { force: true })
    return status()
  })

  const send = (message: TtsWorkerMessage) => {
    if (message.type === 'chunk') {
      const chunk: TtsChunk = {
        kind: 'pcm',
        samples: message.samples,
        sampleRate: message.sampleRate
      }
      win.webContents.send('tts:chunk', message.id, chunk)
      return
    }
    activeIds.delete(message.id)
    if (message.type === 'done') {
      win.webContents.send('tts:done', message.id)
    } else {
      console.error('[tts] generation failed:', message.message)
      win.webContents.send('tts:error', message.id, message.message)
    }
    scheduleIdleShutdown()
  }

  const scheduleIdleShutdown = () => {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (activeIds.size === 0) worker?.kill()
    }, WORKER_IDLE_MS)
  }

  const getWorker = () => {
    if (!worker) {
      const child = utilityProcess.fork(join(__dirname, 'ttsWorker.js'), [], {
        serviceName: 'ChatGuessr text-to-speech'
      })
      child.on('message', send)
      child.on('exit', (code) => {
        if (worker === child) worker = undefined
        for (const id of activeIds) {
          win.webContents.send('tts:error', id, `The voice engine stopped unexpectedly (${code}).`)
        }
        activeIds.clear()
      })
      worker = child
    }
    clearTimeout(idleTimer)
    return worker
  }

  const post = (request: TtsWorkerRequest) => getWorker().postMessage(request)

  const speakLocally = (id: string, text: string): TtsResult => {
    if (download || !isModelDownloaded(modelDir)) {
      return { ok: false, error: 'Download the voice model in Settings → AI voice first.' }
    }
    if (!fs.existsSync(voicePath)) {
      return { ok: false, error: 'Record or import your voice in Settings → AI voice first.' }
    }
    activeIds.add(id)
    post({
      type: 'speak',
      id,
      text: speakableText(text),
      model: pocketModelConfig(modelDir),
      voicePath
    })
    return { ok: true }
  }

  // OpenRouter ------------------------------------------------------------------------------

  const openRouterJobs = new Map<string, AbortController>()
  let speechModels: Promise<SpeechModelOption[]> | undefined

  ipcMain.handle('tts:list-speech-models', () => {
    speechModels ??= fetchSpeechModels().catch((err) => {
      console.error('[tts] could not load speech models:', describeRequestError(err))
      speechModels = undefined
      return []
    })
    return speechModels
  })

  /**
   * Synthesizes the text a few sentences at a time and sends each piece as soon as it's back, so
   * playback starts after the first sentence instead of after the whole description.
   */
  const runOpenRouterJob = async (id: string, apiKey: string, text: string) => {
    const controller = new AbortController()
    openRouterJobs.set(id, controller)
    const model = settings.ttsModel.trim()
    const voice = settings.ttsVoice.trim()
    const segments = splitForSpeech(text)
    const requests = new Map<number, Promise<TtsChunk>>()
    const request = (index: number) => {
      if (index >= segments.length || requests.has(index)) return
      const pending = synthesizeSpeech(apiKey, model, voice, segments[index], controller.signal)
      // Awaited in order below; this only keeps a prefetch that fails early from going unhandled.
      pending.catch(() => {})
      requests.set(index, pending)
    }

    try {
      for (let index = 0; index < segments.length; index++) {
        for (let ahead = 0; ahead < SPEECH_REQUESTS_IN_FLIGHT; ahead++) request(index + ahead)
        const chunk = await requests.get(index)!
        if (controller.signal.aborted) return
        win.webContents.send('tts:chunk', id, chunk)
      }
      win.webContents.send('tts:done', id)
    } catch (err) {
      if (controller.signal.aborted) return
      const error = describeRequestError(err)
      console.error('[tts] OpenRouter speech failed:', error)
      win.webContents.send('tts:error', id, error)
    } finally {
      openRouterJobs.delete(id)
    }
  }

  const speakWithOpenRouter = (id: string, text: string): TtsResult => {
    const apiKey = store.get('openRouterApiKey')
    if (!apiKey) {
      return { ok: false, error: 'No OpenRouter API key set. Add one in Settings → Mode settings.' }
    }
    if (!settings.ttsModel.trim()) {
      return { ok: false, error: 'No voice model set. Pick one in Settings → AI voice.' }
    }
    if (splitForSpeech(text).length === 0) return { ok: false, error: 'Nothing to read out.' }
    void runOpenRouterJob(id, apiKey, text)
    return { ok: true }
  }

  ipcMain.handle('tts:speak', (_event, id: string, text: string): TtsResult => {
    if (!settings.ttsEnabled) {
      return { ok: false, error: 'Read-aloud is turned off in Settings → AI voice.' }
    }
    return settings.ttsProvider === 'local' ? speakLocally(id, text) : speakWithOpenRouter(id, text)
  })

  ipcMain.on('tts:stop', (_event, id: string) => {
    openRouterJobs.get(id)?.abort()
    if (!activeIds.delete(id)) return
    post({ type: 'stop', id })
    scheduleIdleShutdown()
  })
}
