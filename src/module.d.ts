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

/** OSM country borders including territorial waters, as a GeoJSON FeatureCollection. */
declare module '@osm_borders/maritime_10m' {
  const borders: {
    type: 'FeatureCollection'
    features: { type: 'Feature'; properties: { isoA2?: string; isoA3?: string }; geometry: any }[]
  }
  export = borders
}

declare module 'geojson-geometries-lookup' {
  type Feature = { type: 'Feature'; properties: any; geometry: any }
  class GeoJsonGeometriesLookup {
    constructor(geoJson: { type: 'FeatureCollection'; features: Feature[] })
    getContainers(
      point: { type: 'Point'; coordinates: [number, number] },
      options?: { limit?: number; ignorePoints?: boolean; ignoreLines?: boolean }
    ): { type: 'FeatureCollection'; features: Feature[] }
  }
  export = GeoJsonGeometriesLookup
}
