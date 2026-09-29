/** Pocket TTS's own sample rate; decoding straight to it keeps the stored clip small. */
export const VOICE_SAMPLE_RATE = 24000
export const MIN_VOICE_SECONDS = 4
// The voice model only listens to the first 12 seconds of the clip.
export const MAX_VOICE_SECONDS = 12

const FRAME_SECONDS = 0.02
const EDGE_PADDING_SECONDS = 0.15
const TARGET_PEAK = 0.9

/** Decodes anything Chromium can play (the recorder's webm, wav, mp3, …) to mono at 24 kHz. */
export async function decodeToMono(data: ArrayBuffer): Promise<Float32Array> {
  const buffer = await new OfflineAudioContext(1, 1, VOICE_SAMPLE_RATE).decodeAudioData(data)
  const mono = new Float32Array(buffer.length)
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel)
    for (let i = 0; i < samples.length; i++) mono[i] += samples[i] / buffer.numberOfChannels
  }
  return mono
}

/**
 * Cuts the silence off both ends, keeps at most MAX_VOICE_SECONDS and evens out the volume.
 * Throws with a message for the streamer when there isn't enough speech to clone from.
 */
export function prepareVoiceClip(samples: Float32Array, sampleRate: number): Float32Array {
  const frame = Math.max(1, Math.round(sampleRate * FRAME_SECONDS))
  const frameCount = Math.floor(samples.length / frame)
  const loudness = new Float32Array(frameCount)
  let loudest = 0
  for (let f = 0; f < frameCount; f++) {
    let sum = 0
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += samples[i] * samples[i]
    loudness[f] = Math.sqrt(sum / frame)
    loudest = Math.max(loudest, loudness[f])
  }

  // Relative to the loudest moment, so quiet and loud microphones both work.
  const threshold = Math.max(0.002, loudest * 0.1)
  const first = loudness.findIndex((value) => value > threshold)
  if (first === -1) throw new Error('No speech found. Is the right microphone selected?')
  let last = frameCount - 1
  while (loudness[last] <= threshold) last--

  const padding = Math.round(sampleRate * EDGE_PADDING_SECONDS)
  const start = Math.max(0, first * frame - padding)
  const end = Math.min(
    samples.length,
    (last + 1) * frame + padding,
    start + MAX_VOICE_SECONDS * sampleRate
  )
  const seconds = (end - start) / sampleRate
  if (seconds < MIN_VOICE_SECONDS) {
    throw new Error(
      `Only ${seconds.toFixed(1)} s of speech. Read the whole text (at least ${MIN_VOICE_SECONDS} s).`
    )
  }

  const clip = samples.slice(start, end)
  let peak = 0
  for (const sample of clip) peak = Math.max(peak, Math.abs(sample))
  const gain = TARGET_PEAK / peak
  for (let i = 0; i < clip.length; i++) clip[i] *= gain
  return clip
}
