/**
 * Entry point of the text-to-speech utility process (see useTts.ts). Kept out of the main process
 * because generating speech keeps two CPU cores busy, and a crash in native code should not take
 * the app down with it.
 */
import { GenerationConfig, OfflineTts, readWave } from 'sherpa-onnx-node'
import type { PocketModelConfig, TtsWorkerMessage, TtsWorkerRequest } from './messages'

// More threads measured slower, not faster, on a 10-core desktop CPU.
const NUM_THREADS = 2
// The model only listens to this much of the reference clip.
const MAX_REFERENCE_SECONDS = 12

let engine: Promise<OfflineTts> | undefined
const stopped = new Set<string>()
let queue = Promise.resolve()

const post = (message: TtsWorkerMessage) => process.parentPort.postMessage(message)

function getEngine(model: PocketModelConfig) {
  if (!engine) {
    engine = OfflineTts.createAsync({
      model: { pocket: model, numThreads: NUM_THREADS, provider: 'cpu', debug: false },
      maxNumSentences: 1
    })
    // Let the next request try again instead of reusing the failure.
    engine.catch(() => (engine = undefined))
  }
  return engine
}

async function speak({ id, text, model, voicePath }: Extract<TtsWorkerRequest, { type: 'speak' }>) {
  if (stopped.delete(id)) return

  try {
    const tts = await getEngine(model)
    // Read per request: the streamer may have re-recorded their voice since the last one.
    const voice = readWave(voicePath, false)
    await tts.generateAsync({
      text,
      enableExternalBuffer: false,
      generationConfig: new GenerationConfig({
        referenceAudio: voice.samples,
        referenceSampleRate: voice.sampleRate,
        numSteps: 5,
        extra: { max_reference_audio_len: MAX_REFERENCE_SECONDS }
      }),
      onProgress: ({ samples }) => {
        if (stopped.has(id)) return 0
        if (samples.length > 0) {
          post({
            type: 'chunk',
            id,
            samples: new Float32Array(samples),
            sampleRate: tts.sampleRate
          })
        }
        return 1
      }
    })
    if (!stopped.has(id)) post({ type: 'done', id })
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  } finally {
    stopped.delete(id)
  }
}

process.parentPort.on('message', ({ data }: { data: TtsWorkerRequest }) => {
  if (data.type === 'stop') {
    stopped.add(data.id)
  } else {
    // One utterance at a time; a queued one that gets stopped first is skipped.
    queue = queue.then(() => speak(data))
  }
})
