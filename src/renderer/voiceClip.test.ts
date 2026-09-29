import { describe, it, expect } from 'vitest'
import { MAX_VOICE_SECONDS, prepareVoiceClip } from './voiceClip'

const RATE = 24000

/** `silence` s of near-silence, `tone` s of a 200 Hz tone at `amplitude`, then silence again. */
function recording(silence: number, tone: number, amplitude = 0.3) {
  const samples = new Float32Array(Math.round((silence * 2 + tone) * RATE))
  for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() - 0.5) * 0.001
  const start = Math.round(silence * RATE)
  for (let i = 0; i < tone * RATE; i++) {
    samples[start + i] = amplitude * Math.sin((2 * Math.PI * 200 * i) / RATE)
  }
  return samples
}

const peakOf = (samples: Float32Array) =>
  samples.reduce((peak, s) => Math.max(peak, Math.abs(s)), 0)

describe('prepareVoiceClip', () => {
  it('trims the silence at both ends, keeping a little padding', () => {
    const clip = prepareVoiceClip(recording(2, 6), RATE)
    expect(clip.length / RATE).toBeGreaterThan(6)
    expect(clip.length / RATE).toBeLessThan(6.4)
  })

  it('evens out the volume of a quiet recording', () => {
    const clip = prepareVoiceClip(recording(1, 6, 0.02), RATE)
    expect(peakOf(clip)).toBeCloseTo(0.9, 2)
  })

  it('keeps only what the model listens to', () => {
    const clip = prepareVoiceClip(recording(0.5, 20), RATE)
    expect(clip.length).toBe(MAX_VOICE_SECONDS * RATE)
  })

  it('asks for more when there is too little speech', () => {
    expect(() => prepareVoiceClip(recording(3, 2), RATE)).toThrow('Read the whole text')
  })

  it('reports a silent recording', () => {
    expect(() => prepareVoiceClip(new Float32Array(RATE * 5), RATE)).toThrow('No speech found')
  })
})
