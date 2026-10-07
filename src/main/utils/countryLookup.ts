import GeoJsonGeometriesLookup from 'geojson-geometries-lookup'
import borders from '@osm_borders/maritime_10m'
import customBorders from '../lib/customBorders.geo.json'

type Feature = { type: 'Feature'; properties: { isoA2?: string; isoA3?: string }; geometry: any }

/** Features in the OSM dataset that only carry an ISO3 code. */
const ISO3_TO_ISO2: Record<string, string> = { BES: 'BQ', CUW: 'CW', SXM: 'SX' }

let customLookup: GeoJsonGeometriesLookup | undefined
let bordersLookup: GeoJsonGeometriesLookup | undefined
const featureAreas = new WeakMap<object, number>()

/** Planar area of a ring in square degrees; only used to rank overlapping features. */
function ringArea(ring: number[][]): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  }
  return Math.abs(sum / 2)
}

function geometryArea(geometry: any): number {
  if (!geometry) return 0
  switch (geometry.type) {
    case 'Polygon':
      return ringArea(geometry.coordinates[0])
    case 'MultiPolygon':
      return geometry.coordinates.reduce((a: number, p: number[][][]) => a + ringArea(p[0]), 0)
    case 'GeometryCollection':
      return geometry.geometries.reduce((a: number, g: any) => a + geometryArea(g), 0)
    default:
      return 0
  }
}

function featureArea(feature: Feature): number {
  let area = featureAreas.get(feature)
  if (area === undefined) {
    area = geometryArea(feature.geometry)
    featureAreas.set(feature, area)
  }
  return area
}

function featureCode(feature: Feature): string | undefined {
  const { isoA2, isoA3 } = feature.properties
  return isoA2 ?? (isoA3 ? ISO3_TO_ISO2[isoA3] : undefined)
}

/**
 * Get the ISO 3166-1 alpha-2 code of the country (or territory) containing a coordinate,
 * including its territorial waters. Returns undefined for open water and unclaimed land.
 *
 * Custom borders (customBorders.geo.json) take precedence over the OSM dataset. When several
 * OSM features contain the point (e.g. a territory and its parent country), the smallest wins.
 */
export function getCountryCode(lat: number, lng: number): string | undefined {
  const point = { type: 'Point' as const, coordinates: [lng, lat] as [number, number] }

  customLookup ??= new GeoJsonGeometriesLookup(customBorders as any)
  const custom = customLookup.getContainers(point, { limit: 1 }).features[0] as Feature | undefined
  if (custom) return featureCode(custom)

  bordersLookup ??= new GeoJsonGeometriesLookup(borders)
  const matches = bordersLookup.getContainers(point).features as Feature[]
  let best: Feature | undefined
  for (const feature of matches) {
    if (!featureCode(feature)) continue
    if (!best || featureArea(feature) < featureArea(best)) best = feature
  }
  return best ? featureCode(best) : undefined
}
