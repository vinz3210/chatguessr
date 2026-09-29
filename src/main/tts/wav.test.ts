import { describe, it, expect } from 'vitest'
import { encodeWav, wavDurationSeconds } from './wav'

describe('encodeWav', () => {
  it('writes a 16-bit mono PCM header', () => {
    const wav = encodeWav(new Float32Array(24000), 24000)
    expect(wav.length).toBe(44 + 48000)
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.readUInt32LE(4)).toBe(36 + 48000)
    expect(wav.readUInt16LE(20)).toBe(1) // PCM
    expect(wav.readUInt16LE(22)).toBe(1) // mono
    expect(wav.readUInt32LE(24)).toBe(24000)
    expect(wav.readUInt16LE(34)).toBe(16)
  })

  it('clamps and scales samples', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 2, -2, 0.5]), 16000)
    const pcm = [0, 1, 2, 3, 4, 5].map((i) => wav.readInt16LE(44 + i * 2))
    expect(pcm).toEqual([0, 32767, -32768, 32767, -32768, 16384])
  })
})

describe('wavDurationSeconds', () => {
  it('reads the length back from the header', () => {
    expect(wavDurationSeconds(encodeWav(new Float32Array(36000), 24000))).toBe(1.5)
  })

  it('rejects anything that is not a WAV', () => {
    expect(wavDurationSeconds(Buffer.alloc(10))).toBeNull()
    expect(wavDurationSeconds(Buffer.alloc(44))).toBeNull()
  })
})
