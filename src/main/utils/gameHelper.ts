import axios from 'axios'
import countryIso from 'coordinate_to_country'
const { session } = require('electron')
import countryBoundingBoxes from '../lib/countryBoundingBoxes.json'

/**
 * Country code mapping for 2-character ISO codes that should be considered
 * part of another country for GeoGuessr streak purposes.
 */
import streakCodes from '../lib/streakCodes.json'

const GEOGUESSR_URL = 'https://geoguessr.com'
const CG_API_URL = import.meta.env.VITE_CG_API_URL ?? 'https://chatguessr.com/api'
const CG_PUBLIC_URL = import.meta.env.VITE_CG_PUBLIC_URL ?? 'chatguessr.com'

/**
 * Checks if the URL is an in-game page.
 */
export function isGameURL(url: string): boolean {
  return url.includes('/game/')
}

/**
 * Gets the Game ID from a game URL
 * Checks if ID is 16 characters in length
 */
export function getGameId(url: string): string | void {
  const id = url.slice(url.lastIndexOf('/') + 1)
  if (id.length == 16) return id
}

/**
 *  Get GeoGuessr cookies
 */
async function getCookies() {
  return session.defaultSession.cookies
    .get({ url: 'https://www.geoguessr.com' })
    .then((cookies) => {
      const ncfa = cookies.find((cookie) => cookie.name === '_ncfa')
      return ncfa ? { Cookie: `${ncfa.name}=${ncfa.value}` } : null
    })
    .catch((err) => {
      console.error(err)
    })
}

/**
 * Fetch a game seed from the GeoGuessr API.
 */
export async function fetchSeed(url: string): Promise<Seed | undefined> {
  const cookies = await getCookies()
  const gameId = getGameId(url)
  if (!gameId || !cookies) return

  let retries = 0
  const maxRetries = 3
  while (retries < maxRetries) {
    try {
      const response = await axios.get(`${GEOGUESSR_URL}/api/v3/games/${gameId}`, {
        headers: cookies
      })
      return response.data
    } catch (error: any) {
      retries++
    }
  }
  throw new Error(`Failed to fetch seed`)
}

/**
 * Compare two coordinates
 */
export function compareLatLng(a: LatLng, b: LatLng) {
  return a.lat === b.lat && a.lng === b.lng
}

/**
 * Get the country code for a coordinate.
 */
export async function getStreakCode(location: LatLng): Promise<string | undefined> {
  const localResults = countryIso(location.lat, location.lng, true)
  const localIso = localResults.length > 0 ? localResults[0] : undefined
  if (!localIso) return

  return streakCodes[localIso]
}

/**
 * Parse lat/lng coordinates from a string.
 */
export function parseCoordinates(coordinates: string): LatLng | void {
  const regex =
    /^(?<lat>[-+]?(?:[1-8]?\d(?:\.\d+)?|90(?:\.0+)?)),\s*(?<lng>[-+]?(?:180(?:\.0+)?|(?:(?:1[0-7]\d)|(?:[1-9]?\d))(?:\.\d+)?))$/
  const m = regex.exec(coordinates)
  if (m?.groups) {
    return { lat: parseFloat(m.groups.lat), lng: parseFloat(m.groups.lng) }
  }
}

/**
 * Returns map scale
 */
export function calculateScale(bounds: Bounds): number {
  return haversineDistance(bounds.min, bounds.max) / 7.458421
}

/**
 * Returns distance in km between two coordinates
 */
export function haversineDistance(mk1: LatLng, mk2: LatLng): number {
  const R = 6371.071
  const rlat1 = mk1.lat * (Math.PI / 180)
  const rlat2 = mk2.lat * (Math.PI / 180)
  const difflat = rlat2 - rlat1
  const difflon = (mk2.lng - mk1.lng) * (Math.PI / 180)
  const km =
    2 *
    R *
    Math.asin(
      Math.sqrt(
        Math.sin(difflat / 2) * Math.sin(difflat / 2) +
          Math.cos(rlat1) * Math.cos(rlat2) * Math.sin(difflon / 2) * Math.sin(difflon / 2)
      )
    )
  return km
}

/**
 * Returns score based on distance and scale
 */

function modifyScore(score: number, modifier: number, allowMinus: boolean, roundNumber?:number, roundMultis?:string, randomRoundMultiplier?:number): number {

  var multiModifier = 1
  if (roundMultis == "multiMerchant"){
    switch (roundNumber){
      case 1:
        multiModifier = 1
        break
      case 2:
        multiModifier = 1.5
        break
      case 3:
        multiModifier = 2
        break
      case 4:
        multiModifier = 2.5
        break
      case 5:
        multiModifier = 3
        break
    }
    score = score * multiModifier
  }
  if (roundMultis == "random"){
    if (randomRoundMultiplier == undefined){
      console.log("Random multiplier is undefined")
      return score
    }
    score = score * randomRoundMultiplier
  }
  score = score + modifier 
  score = Math.round(score)
  if (score < 0 && !allowMinus) score = 0

  console.log("score: " + score + " modifier: " + modifier + " allowMinus: " + allowMinus + " roundNumber: " + roundNumber + " roundMultis: " + roundMultis + " randomRoundMultiplier: " + randomRoundMultiplier)
  return score
}

/**
 * Returns the axis-only distance between a guess and the target location, both
 * in km (`lat`/`lng`, used for scoring) and in degrees (`latDeg`/`lngDeg`, shown
 * on the scoreboard).
 *
 * When only one axis (latitude or longitude) is used for scoring, the other axis
 * is ignored entirely. For longitude, the degree->km conversion is corrected by
 * cos(latitude), otherwise the same degree offset would count wildly differently
 * near the poles vs. the equator.
 */
export function getAxisDistances(
  guess: LatLng,
  target: LatLng
): { lat: number; lng: number; latDeg: number; lngDeg: number } {
  const latDeg = Math.abs(guess.lat - target.lat)
  const latKm = latDeg * 111.32

  // Take the short way around, so 179 vs -179 is 2 degrees apart and not 358.
  const rawLngDeg = Math.abs(guess.lng - target.lng) % 360
  const lngDeg = Math.min(rawLngDeg, 360 - rawLngDeg)
  // Longitude degree length depends on latitude: 111.32 * cos(lat) km per degree
  const midLatRad = ((guess.lat + target.lat) / 2) * (Math.PI / 180)
  const lngKm = lngDeg * 111.32 * Math.cos(midLatRad)

  return { lat: latKm, lng: lngKm, latDeg, lngDeg }
}

export function calculateScore(distance: number, scale: number, isCorrectCountry: boolean, isClosestInWrongCountryModeActivated: boolean,  waterPlonkMode: string, isPlonkOnLand: boolean, invertScores: boolean, modifierMinusPointsIfWrongCountry: number, isBRMode: boolean, battleRoyaleSubtractedPoints: number, allowMinus: boolean,  maxErrorDistance?: number, roundNumber?: number, roundMultis?: string, randomRoundMultiplier?: number, scoringMode?: string, axisDistances?: { lat: number; lng: number }): number {
  let modifier = 0
  if (!isCorrectCountry) modifier = - modifierMinusPointsIfWrongCountry
  if(isBRMode && true)// battleRoyaleSubtractedPoints > 0)
    modifier = modifier - battleRoyaleSubtractedPoints

  /**
   * Resolve the effective raw score (0..5000) for the selected scoring mode.
   * - "off" (or undefined): normal haversine distance.
   * - "latitude": only the latitude difference counts.
   * - "longitude": only the longitude difference counts.
   * - "latlng": both axes each contribute up to 2500 (via the same per-axis
   *   curve), so the total can still reach 5000.
   */
  const axisCurve = (axd: number): number =>
    maxErrorDistance
      ? Math.round(5000 * Math.exp(-10 * ((axd * 1000) / maxErrorDistance)))
      : 5000 * Math.pow(0.99866017, (axd * 1000) / scale)

  const scoringRawScore = (): number => {
    if (scoringMode === 'latitude') return axisCurve(axisDistances?.lat ?? distance)
    if (scoringMode === 'longitude') return axisCurve(axisDistances?.lng ?? distance)
    if (scoringMode === 'latlng') {
      // Each axis contributes at most half (5000/2 = 2500), total capped at 5000.
      const latScore = axisCurve(axisDistances?.lat ?? 0)
      const lngScore = axisCurve(axisDistances?.lng ?? 0)
      return Math.round(0.5 * latScore + 0.5 * lngScore)
    }
    return axisCurve(distance)
  }

  // Without maxErrorDistance the original code returned immediately with the
  // plain score (no wrong-country / ocean / invert handling). Preserve that,
  // only the effective raw score changes with the selected scoring mode.
  if (!maxErrorDistance) {
    return modifyScore(
      scoringRawScore(),
      modifier,
      allowMinus,
      roundNumber,
      roundMultis,
      randomRoundMultiplier
    )
  }

  if (isCorrectCountry && isClosestInWrongCountryModeActivated) return 0
  if (waterPlonkMode == "illegal" && !isPlonkOnLand) return 0
  if (waterPlonkMode == "mandatory" && isPlonkOnLand) return 0
  const score = scoringRawScore()
  if (!invertScores){
    return modifyScore(score ,modifier, allowMinus, roundNumber, roundMultis, randomRoundMultiplier)
  }
  else{
    if (distance > 15000){
      return modifyScore(4999 - Math.round(Math.round(20015.1 - distance)*0.2052) ,modifier, allowMinus, roundNumber, roundMultis, randomRoundMultiplier)
    }

    if (distance > 7500){
      return modifyScore(4000 - Math.round(Math.round(15000  - distance)*0.4) ,modifier, allowMinus, roundNumber, roundMultis, randomRoundMultiplier)
    }

    if (distance > 5000){
      return modifyScore(1000 - Math.round(Math.round(7500  - distance)*0.2) ,modifier, allowMinus, roundNumber, roundMultis, randomRoundMultiplier)
    }

    if (distance > 2500){
      return modifyScore(500 - Math.round(Math.round(5000  - distance)*0.1) ,modifier, allowMinus, roundNumber, roundMultis, randomRoundMultiplier)
    }
  }

  if (distance > 100){
    return modifyScore(250 - Math.round(Math.round(2500  - distance)*0.1) ,modifier, allowMinus, roundNumber, roundMultis, randomRoundMultiplier)
  }

  return 0

}

/**
 * Upload scores to the Chatguessr API and return the game summary link
 */
export async function makeGameSummaryLink(params: {
  accessToken: string
  bot: string
  streamer: string
  map: string
  mode: GameMode
  locations: Location_[]
  gameResults: GameResult[]
}): Promise<string> {
  const res = await axios.post<{ code: string }>(
    `${CG_API_URL}/game`,
    {
      bot: params.bot,
      streamer: params.streamer,
      map: params.map,
      mode: params.mode,
      locations: params.locations,
      players: params.gameResults
    },
    { headers: { access_token: params.accessToken } }
  )

  return `${CG_PUBLIC_URL}/game/${res.data.code} `
}

/**
 * Make GMaps URL from a Location object
 */
export async function makeMapsUrl(location: Location_): Promise<string> {
  const url = new URL('https://www.google.com/maps/@?api=1&map_action=pano')
  if (location.panoId) url.searchParams.set('pano', location.panoId)
  url.searchParams.set('viewpoint', `${location.lat},${location.lng}`)
  url.searchParams.set('heading', String(location.heading))
  url.searchParams.set('pitch', String(location.pitch))
  if (location.zoom) {
    const fov = 180 / 2 ** location.zoom
    url.searchParams.set('fov', String(fov))
  }

  const shortUrl = await shortenMapsUrl(url.href)
  return shortUrl ?? url.href
}

async function shortenMapsUrl(url: string): Promise<string | undefined> {
  const v = encodeURIComponent(url.replaceAll('!', '*21'))
  try {
    const { data } = await axios.get<string | undefined>(
      `https://www.google.com/maps/rpc/shorturl?authuser=0&hl=en&pb=!1s${v}!2m1!7e81!6b1`
    )
    if (data) {
      const [shortened]: string = JSON.parse(data.split('\n')[1])
      return shortened
    }
  } catch (e) {
    return undefined
  }
  return undefined
}

export async function fetchMap(mapToken: string): Promise<GeoGuessrMap | undefined> {
  const cookies = await getCookies()
  if (!cookies) {
    return
  }

  const { data } = await axios.get(`${GEOGUESSR_URL}/api/maps/${mapToken}`, { headers: cookies })
  return data
}

/**
 * Returns random coordinates within land, no Antarctica
 */

export function checkCountryCodeValidity(countryCode: string): boolean {
  countryCode = countryCode.toUpperCase()
  return countryBoundingBoxes.hasOwnProperty(countryCode)
}


function randomLatitudeInBounds(minLat, maxLat) {
  // when picking random coords, mongolia comes up more often then it should because of the shape of the globe
  // test with 10000 random plonks
  // occurances:  { MN: 85, TD: 56 }
  // to fix this, we correct for curvature of the earth by using the asin function
  // reult after changes
  // occurances:  { MN: 89, TD: 82 }
  const minLatRad = minLat * Math.PI / 180;  // Convert to radians
  const maxLatRad = maxLat * Math.PI / 180;  // Convert to radians

  const u = Math.random();
  const sinMinLat = Math.sin(minLatRad);
  const sinMaxLat = Math.sin(maxLatRad);
  const randomSinLat = sinMinLat + (sinMaxLat - sinMinLat) * u;

  const randomLatRad = Math.asin(randomSinLat);
  const randomLat = randomLatRad * 180 / Math.PI;  // Convert back to degrees

  return randomLat;
}

export async function getRandomCoordsInLandByCountryCode(countryCode: string, i: number = 0): Promise<LatLng> {
  // send message to frontend if country code is invalid
  countryCode = countryCode.toUpperCase()
  if(!checkCountryCodeValidity(countryCode)){
    console.log("Invalid country code")
    return { lat: 0, lng: 0 }
  }
  let countryTheCountryCodeIsIn = streakCodes[countryCode]
  if (!countryTheCountryCodeIsIn){
    console.log("Country code not in streakCodes")
    return { lat: 0, lng: 0 }
  }
  const bounds = countryBoundingBoxes[countryCode].boundingBox
  if (!bounds) return { lat: 0, lng: 0 }
  const lat = randomLatitudeInBounds(bounds.minLat, bounds.maxLat)
  const lng = Math.random() * (bounds.maxLng - bounds.minLng) + bounds.minLng
  const localResults = countryIso(lat, lng, true)
  console.log("lat: " + lat + " lng: " + lng + " localResults: " + localResults + " countryTheCountryCodeIsIn: " + countryTheCountryCodeIsIn)
  if ((!localResults.length && i < 50) || (localResults[0]!=countryTheCountryCodeIsIn && i < 50)) return await getRandomCoordsInLandByCountryCode(countryCode, i + 1)
  return { lat, lng }

}

export async function getRandomCoordsInLand(bounds: Bounds | null = null, i: number = 0): Promise<LatLng> {
  let lat_north = 85,
    lat_south = -60,
    lng_west = -180,
    lng_east = 180
  if (bounds != null) {
    lat_north = bounds.max.lat
    lat_south = Math.max(bounds.min.lat, lat_south)
    lng_east = bounds.max.lng
    lng_west = bounds.min.lng
  }
  //const lat = Math.random() * (lat_north - lat_south) + lat_south
  const lat = randomLatitudeInBounds(lat_south, lat_north)
  const lng = Math.random() * (lng_east - lng_west) + lng_west
  const localResults = countryIso(lat, lng, true)
  if (!localResults.length && i < 50) return await getRandomCoordsInLand(bounds, i + 1)
  return { lat, lng }
}
export async function getRandomCoordsNotInLand(bounds: Bounds | null = null, i: number = 0): Promise<LatLng> {
  let lat_north = 85,
    lat_south = -60,
    lng_west = -180,
    lng_east = 180
  if (bounds != null) {
    lat_north = bounds.max.lat
    lat_south = Math.max(bounds.min.lat, lat_south)
    lng_east = bounds.max.lng
    lng_west = bounds.min.lng
  }
  const lat = randomLatitudeInBounds(lat_south, lat_north)
  const lng = Math.random() * (lng_east - lng_west) + lng_west
  const localResults = countryIso(lat, lng, true)
  if (localResults.length && i < 50) return await getRandomCoordsNotInLand(bounds, i + 1)
  return { lat, lng }
}

export async function isCoordsInLand(location: LatLng): Promise<boolean> {
  const localResults = countryIso(location.lat, location.lng, true)
  return localResults.length > 0
}

export async function getStreamerAvatar(channel: string): Promise<{ avatar: string | undefined }> {
  try {
    const { data } = await axios.get<{ avatar: string }>(`${CG_API_URL}/channel/${channel}`)
    return data
  } catch (e) {
    return { avatar: undefined }
  }
}

export function dateToUnixTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000)
}

/**
 * Parses a user-defined string that represents a date into a Unix timestamp. Will set timestamp to > 0 on success
 * or == 0 for an empty input, and -1 on unrecognized dates.
 */
export async function parseUserDate(
  userDateStr: string | undefined
): Promise<{ timeStamp: number; description: string | undefined }> {
  let timeStamp = -1
  let description: string | undefined =
    "Unsupported date (supported dates: 'day', 'week', 'month', 'year', 'YYYYMMDD')"
  if (!userDateStr || userDateStr === 'all') {
    timeStamp = 0
    description = undefined
  }
  if (userDateStr === 'day' || userDateStr === 'today') {
    timeStamp = dateToUnixTimestamp(new Date(new Date().setHours(0, 0, 0, 0)))
    description = 'today'
  } else if (userDateStr === 'week') {
    const lastMidnight = new Date(new Date().setHours(0, 0, 0, 0))
    const day = lastMidnight.getDay() || 7 // Convert sunday to 7
    lastMidnight.setHours(-24 * (day - 1))
    timeStamp = dateToUnixTimestamp(lastMidnight)
    description = 'this week'
  } else if (userDateStr === 'month') {
    const now = new Date()
    timeStamp = dateToUnixTimestamp(new Date(now.getFullYear(), now.getMonth(), 1))
    description = 'this month'
  } else if (userDateStr === 'year') {
    const now = new Date()
    timeStamp = dateToUnixTimestamp(new Date(now.getFullYear(), 0, 1))
    description = 'this year'
  }
  if (userDateStr?.match(/^\d{8}$/)) {
    const year = parseInt(userDateStr.slice(0, 4))
    const month = parseInt(userDateStr.slice(4, 6))
    const day = parseInt(userDateStr.slice(6, 8))
    if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      timeStamp = dateToUnixTimestamp(new Date(year, month - 1, day))
      let monthString = "0"+month.toString()
      let dayString = "0"+day.toString()
      monthString = monthString.substring(monthString.length-2)
      dayString = dayString.substring(dayString.length-2)
      description = `${year}-${monthString}-${dayString}`
    }
  }
  return { timeStamp: timeStamp, description: description }
}
