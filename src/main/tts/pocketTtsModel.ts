import axios from 'axios'
import crypto from 'crypto'
import fs from 'fs'
import { join } from 'path'
import { Transform } from 'stream'
import { pipeline } from 'stream/promises'

// Kyutai's Pocket TTS (CC-BY-4.0), ONNX export packaged for sherpa-onnx. Both repos are pinned
// to a revision so the hashes below stay valid.
const INT8_URL =
  'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-int8-2026-01-26/resolve/e715955cf50d18d919d37231513c0e914b83661a'
const FP32_URL =
  'https://huggingface.co/csukuangfj2/sherpa-onnx-pocket-tts-2026-01-26/resolve/96d1e53ce3311ca6c2c6a35e2062d36b4cec6fa3'

// Fails a download that stops receiving data, not one that is merely slow.
const STALL_TIMEOUT_MS = 30_000

export const MODEL_DIR_NAME = 'pocket-tts-int8-2026-01-26'

// The language model stays int8 (a quarter of the size, same speed), but the decoder that turns
// it into sound must be full precision: the int8 decoder puts audible hiss about 20 dB below the
// voice. The full-precision one costs 19 MB more and runs just as fast.
const MODEL_FILES = [
  {
    name: 'lm_main.int8.onnx',
    url: INT8_URL,
    size: 76341079,
    sha256: 'bfc0c7e7e3d72864fa3bb2ee499f62f21ddc1474b885f5f3ca570f8be73e787e'
  },
  {
    name: 'encoder.onnx',
    url: INT8_URL,
    size: 72713165,
    sha256: 'e8f2f6d301ffb96e398b138a7dc6d3038622d236044636b73d920bab85890260'
  },
  {
    name: 'decoder.onnx',
    url: FP32_URL,
    size: 41478706,
    sha256: 'f267880fde6c58b17b0a8f3647eaf8dcfad321f833f32d583ebc2fb2d1a15f10'
  },
  {
    name: 'text_conditioner.onnx',
    url: INT8_URL,
    size: 16388343,
    sha256: '0b84e837d7bfaf2c896627b03e3f080320309f37f4fc7df7698c644f7ba5e6b1'
  },
  {
    name: 'lm_flow.int8.onnx',
    url: INT8_URL,
    size: 9962530,
    sha256: '8d627d235c44a597da908e1085ebe241cbbe358964c502c5a5063d18851a5529'
  },
  {
    name: 'token_scores.json',
    url: INT8_URL,
    size: 123616,
    sha256: '5be2f278caf9b9800741f0fd82bff677f4943ec764c356f907213434b622d958'
  },
  {
    name: 'vocab.json',
    url: INT8_URL,
    size: 69478,
    sha256: '6fb646346cf931016f70c4921aab0900ce7a304b893cb02135c74e294abfea01'
  }
]

// Left behind by earlier versions; removed once a download has succeeded.
const SUPERSEDED_FILES = ['decoder.int8.onnx']

export const MODEL_TOTAL_BYTES = MODEL_FILES.reduce((total, file) => total + file.size, 0)

/** The model config sherpa-onnx's `OfflineTts` expects, pointing into `dir`. */
export function pocketModelConfig(dir: string) {
  return {
    lmFlow: join(dir, 'lm_flow.int8.onnx'),
    lmMain: join(dir, 'lm_main.int8.onnx'),
    encoder: join(dir, 'encoder.onnx'),
    decoder: join(dir, 'decoder.onnx'),
    textConditioner: join(dir, 'text_conditioner.onnx'),
    vocabJson: join(dir, 'vocab.json'),
    tokenScoresJson: join(dir, 'token_scores.json')
  }
}

function hasFile(dir: string, file: (typeof MODEL_FILES)[number]) {
  try {
    return fs.statSync(join(dir, file.name)).size === file.size
  } catch {
    return false
  }
}

/** Cheap check (sizes only); hashes are verified when a file is downloaded. */
export function isModelDownloaded(dir: string): boolean {
  return MODEL_FILES.every((file) => hasFile(dir, file))
}

/** Downloads whatever is missing into `dir`, verifying every file against its SHA-256. */
export async function downloadModel(
  dir: string,
  onProgress: (receivedBytes: number, totalBytes: number) => void
): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true })

  let received = 0
  for (const file of MODEL_FILES) {
    if (hasFile(dir, file)) {
      received += file.size
      continue
    }

    const target = join(dir, file.name)
    const partial = `${target}.part`
    const hash = crypto.createHash('sha256')
    const response = await axios.get(`${file.url}/${file.name}`, {
      responseType: 'stream',
      timeout: STALL_TIMEOUT_MS
    })
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        hash.update(chunk)
        received += chunk.length
        onProgress(received, MODEL_TOTAL_BYTES)
        done(null, chunk)
      }
    })
    await pipeline(response.data, meter, fs.createWriteStream(partial))

    if (hash.digest('hex') !== file.sha256) {
      await fs.promises.rm(partial, { force: true })
      throw new Error(`${file.name} did not download correctly. Please try again.`)
    }
    await fs.promises.rename(partial, target)
  }
  for (const name of SUPERSEDED_FILES) {
    await fs.promises.rm(join(dir, name), { force: true })
  }
  onProgress(MODEL_TOTAL_BYTES, MODEL_TOTAL_BYTES)
}
