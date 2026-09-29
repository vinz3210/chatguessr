import type { pocketModelConfig } from './pocketTtsModel'

export type PocketModelConfig = ReturnType<typeof pocketModelConfig>

/** Main process → TTS utility process. */
export type TtsWorkerRequest =
  | { type: 'speak'; id: string; text: string; model: PocketModelConfig; voicePath: string }
  | { type: 'stop'; id: string }

/** TTS utility process → main process. */
export type TtsWorkerMessage =
  | { type: 'chunk'; id: string; samples: Float32Array; sampleRate: number }
  | { type: 'done'; id: string }
  | { type: 'error'; id: string; message: string }
