const HEADER_BYTES = 44

/** 16-bit PCM mono WAV, a format sherpa-onnx's `readWave` understands. */
export function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2
  const buffer = Buffer.alloc(HEADER_BYTES + dataBytes)

  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(36 + dataBytes, 4)
  buffer.write('WAVE', 8, 'ascii')
  buffer.write('fmt ', 12, 'ascii')
  buffer.writeUInt32LE(16, 16) // fmt chunk size
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(1, 22) // mono
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28) // byte rate
  buffer.writeUInt16LE(2, 32) // block align
  buffer.writeUInt16LE(16, 34) // bits per sample
  buffer.write('data', 36, 'ascii')
  buffer.writeUInt32LE(dataBytes, 40)

  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff), 44 + i * 2)
  }
  return buffer
}

/** Length of a WAV written by `encodeWav`, from its header; null if it isn't one. */
export function wavDurationSeconds(header: Buffer): number | null {
  if (
    header.length < HEADER_BYTES ||
    header.toString('ascii', 0, 4) !== 'RIFF' ||
    header.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    return null
  }
  const byteRate = header.readUInt32LE(28)
  return byteRate ? header.readUInt32LE(40) / byteRate : null
}

export const WAV_HEADER_BYTES = HEADER_BYTES
