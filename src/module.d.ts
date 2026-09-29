/// <reference types="vite/client" />
/// <reference types="vite-svg-loader" />

/** The slice of sherpa-onnx-node's API the text-to-speech worker uses. */
declare module 'sherpa-onnx-node' {
  type Wave = { samples: Float32Array; sampleRate: number }

  class GenerationConfig {
    constructor(config: {
      speed?: number
      referenceAudio?: Float32Array
      referenceSampleRate?: number
      numSteps?: number
      extra?: Record<string, number>
    })
  }

  class OfflineTts {
    static createAsync(config: unknown): Promise<OfflineTts>
    readonly sampleRate: number
    generateAsync(request: {
      text: string
      generationConfig: GenerationConfig
      /** Must be false inside Electron, whose V8 sandbox rejects external buffers. */
      enableExternalBuffer: boolean
      /** Return 0 to stop generating. */
      onProgress?: (progress: { samples: Float32Array; progress: number }) => number
    }): Promise<Wave>
  }

  function readWave(filename: string, enableExternalBuffer?: boolean): Wave
}

declare module 'coordinate_to_country' {
  function coordinate_to_country(lat: number, lng: number, isoA2?: boolean): string[]
  export = coordinate_to_country
}
