import axios from 'axios'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1'
const DESCRIBE_TIMEOUT_MS = 60_000
const MODELS_TIMEOUT_MS = 15_000

const SYSTEM_PROMPT = `You are the eyes of a GeoGuessr player who cannot see the round. You get one Street View image and the direction the camera is facing. Describe the scene so the player can work out where in the world it is.

- Describe only what is visible. Never name, guess or hint at the country, region or city, and never explain what a clue is typical of. The player has to draw the conclusions.
- Cover every clue you can see, most telling first: road surface and line markings (colours, dashed or solid, edge lines), which side of the road traffic uses, bollards, utility poles and wires, signs (shape, colours, script; copy readable text exactly), licence plates (colours, shape), vehicles, buildings and roofs, fences and walls, vegetation and trees, terrain, soil colour, sky and weather.
- Say where the sun and shadows point, in compass terms.
- If parts of the Google car or camera are visible, describe them.
- Use the camera heading to give directions, e.g. "to the north-east".
- Plain text only, no markdown. 120 to 200 words.`

const COMPASS_POINTS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west'
]

/** Street View headings drift outside 0–359 when the view is panned. */
export function normalizeHeading(heading: number): number {
  return ((Math.round(heading) % 360) + 360) % 360
}

export function headingToCompassPoint(heading: number): string {
  return COMPASS_POINTS[Math.round(normalizeHeading(heading) / 45) % COMPASS_POINTS.length]
}

export function describeView(heading: number, pitch: number): string {
  const normalized = normalizeHeading(heading)
  let text = `The camera faces ${normalized}° (${headingToCompassPoint(normalized)}).`
  const tilt = Math.round(pitch)
  if (Math.abs(tilt) >= 10) text += ` It is tilted ${Math.abs(tilt)}° ${tilt > 0 ? 'up' : 'down'}.`
  return text
}

/** Models answer in markdown now and then despite the prompt; the overlay shows plain text. */
export function cleanDescription(text: string): string {
  return text
    .replace(/\*\*|__/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function parseCompletion(data: any): string {
  const choice = data?.choices?.[0]
  if (!choice) {
    const apiMessage = data?.error?.message
    throw new Error(apiMessage ? `OpenRouter: ${apiMessage}` : 'OpenRouter returned no answer.')
  }
  if (choice.error?.message) throw new Error(`OpenRouter: ${choice.error.message}`)

  const content = choice.message?.content
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.map((part) => part?.text ?? '').join('')
        : ''
  const description = cleanDescription(text)
  if (!description) throw new Error('The model returned an empty description.')
  return description
}

/** Turns a failed request into something the streamer can act on. Never includes the API key. */
export function describeRequestError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return 'OpenRouter took too long to answer.'
    }
    const status = err.response?.status
    const apiMessage = err.response?.data?.error?.message
    if (status === 401) return 'OpenRouter rejected the API key.'
    if (status === 402) return 'Your OpenRouter account is out of credits.'
    if (apiMessage) return `OpenRouter: ${apiMessage}`
    if (status) return `OpenRouter answered with HTTP ${status}.`
    return `Could not reach OpenRouter (${err.message}).`
  }
  return err instanceof Error ? err.message : String(err)
}

export async function describePanorama(
  apiKey: string,
  model: string,
  request: AiDescriptionRequest
): Promise<AiDescription> {
  const { data } = await axios.post(
    `${OPENROUTER_API_URL}/chat/completions`,
    {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: describeView(request.heading, request.pitch) },
            { type: 'image_url', image_url: { url: request.image } }
          ]
        }
      ]
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, 'X-Title': 'ChatGuessr' },
      timeout: DESCRIBE_TIMEOUT_MS
    }
  )

  return {
    text: parseCompletion(data),
    model,
    heading: normalizeHeading(request.heading),
    pitch: Math.round(request.pitch)
  }
}

export function pickVisionModels(models: any[]): AiModelOption[] {
  return models
    .filter(
      (model) =>
        model.architecture?.input_modalities?.includes('image') &&
        model.architecture?.output_modalities?.includes('text') &&
        // Batch variants are queued and can take hours to answer.
        !model.id.endsWith(':batch')
    )
    .map((model) => ({ id: model.id, name: model.name ?? model.id }))
}

/** The model list is public, so this works before an API key is set. */
export async function fetchVisionModels(): Promise<AiModelOption[]> {
  const { data } = await axios.get(`${OPENROUTER_API_URL}/models`, { timeout: MODELS_TIMEOUT_MS })
  return pickVisionModels(data?.data ?? [])
}
