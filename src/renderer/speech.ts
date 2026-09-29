export type SpeechState = 'idle' | 'loading' | 'playing'

// Speech arrives only a little faster than it plays, so start the first piece slightly late; that
// head start keeps the next piece ready before the current one runs out.
const LEAD_SECONDS = 0.5

// One context per sample rate. Raw samples play in a context of their own rate, because a
// buffer played into a context of another rate is upsampled by linear interpolation, which
// leaves a fizzy mirror image of every "s" and "sh". Encoded audio is decoded straight to
// the rate of the default context, with proper resampling.
const contexts = new Map<number | undefined, AudioContext>()
function getContext(sampleRate?: number) {
  let context = contexts.get(sampleRate)
  if (!context) {
    context = new AudioContext(sampleRate ? { sampleRate } : undefined)
    contexts.set(sampleRate, context)
  }
  return context
}

// The description and a few chat answers, so switching between them doesn't pay twice. Kept
// small: a full description is several MB of decoded audio.
const MAX_REMEMBERED = 4
const remembered = new Map<string, { context: AudioContext; buffers: AudioBuffer[] }>()
let stopCurrent: (() => void) | null = null

/** Makes the next `speak` of any text generate again, e.g. after the voice changed. */
export function forgetSpokenAudio() {
  remembered.clear()
}

/**
 * Reads `text` aloud with the configured voice, playing audio as it arrives. `onState` follows
 * along and ends with 'idle' (plus a message if something failed). Starting another utterance
 * stops this one. Returns a function that stops it early.
 *
 * Saying a recent text again replays its audio instead of paying for it twice, unless `reuse`
 * is false.
 */
export function speak(
  text: string,
  onState: (state: SpeechState, error?: string) => void,
  { reuse = true } = {}
) {
  stopCurrent?.()

  const { chatguessrApi } = window
  // Resumed while we're still inside the click that started this.
  void getContext().resume()

  const id = crypto.randomUUID()
  const buffers: AudioBuffer[] = []
  const sources = new Set<AudioBufferSourceNode>()
  let context: AudioContext | undefined
  let unsubscribe: (() => void)[] = []
  let nextStart = 0
  let generated = false
  let finished = false
  // Pieces are decoded one at a time so they play in the order they arrived.
  let decoding = Promise.resolve()

  const finish = (error?: string) => {
    if (finished) return
    finished = true
    if (stopCurrent === stop) stopCurrent = null
    for (const off of unsubscribe) off()
    for (const source of sources) {
      source.onended = null
      source.stop()
    }
    sources.clear()
    if (!generated) chatguessrApi.stopSpeaking(id)
    onState('idle', error)
  }
  const stop = () => finish()
  stopCurrent = stop

  const play = (buffer: AudioBuffer) => {
    const ctx = context!
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    nextStart = Math.max(nextStart, ctx.currentTime + LEAD_SECONDS)
    source.start(nextStart)
    nextStart += buffer.duration
    source.onended = () => {
      sources.delete(source)
      if (generated && sources.size === 0) finish()
    }
    if (sources.size === 0) onState('playing')
    sources.add(source)
  }

  const toBuffer = async (chunk: TtsChunk) => {
    context ??= getContext(chunk.kind === 'pcm' ? chunk.sampleRate : undefined)
    void context.resume()
    if (chunk.kind === 'pcm') {
      const buffer = context.createBuffer(1, chunk.samples.length, chunk.sampleRate)
      buffer.copyToChannel(chunk.samples, 0)
      return buffer
    }
    // decodeAudioData takes ownership of the bytes it's given, so hand it a copy.
    return context.decodeAudioData(chunk.data.slice().buffer)
  }

  const earlier = reuse ? remembered.get(text) : undefined
  if (earlier) {
    context = earlier.context
    void context.resume()
    generated = true
    for (const buffer of earlier.buffers) play(buffer)
    if (sources.size === 0) finish()
    return stop
  }

  onState('loading')
  unsubscribe = [
    chatguessrApi.onTtsChunk((chunkId, chunk) => {
      if (chunkId !== id || finished) return
      decoding = decoding
        .then(async () => {
          const buffer = await toBuffer(chunk)
          if (finished) return
          buffers.push(buffer)
          play(buffer)
        })
        .catch((err) => finish(`Could not play the audio: ${String(err)}`))
    }),
    chatguessrApi.onTtsDone((doneId) => {
      if (doneId !== id) return
      decoding = decoding.then(() => {
        if (finished) return
        generated = true
        if (context) {
          remembered.delete(text)
          remembered.set(text, { context, buffers })
          if (remembered.size > MAX_REMEMBERED) remembered.delete(remembered.keys().next().value!)
        }
        if (sources.size === 0) finish()
      })
    }),
    chatguessrApi.onTtsError((errorId, message) => {
      if (errorId === id) finish(message)
    })
  ]
  chatguessrApi.speak(id, text).then(
    (result) => {
      if (!result.ok) finish(result.error)
    },
    (err) => finish(err instanceof Error ? err.message : String(err))
  )
  return stop
}
