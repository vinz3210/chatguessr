import axios from 'axios'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1'
const COMPLETION_TIMEOUT_MS = 60_000
// Older turns are dropped past this; must be even so the kept part starts with a question.
const MAX_CHAT_HISTORY = 20
const SPEECH_TIMEOUT_MS = 60_000
const MODELS_TIMEOUT_MS = 15_000
// Generating a piece takes time roughly in proportion to its length, so pieces start small and
// grow: each comes back before the shorter one ahead of it has finished playing.
const FIRST_SPEECH_GROUP_CHARS = 100
const SPEECH_GROUP_GROWTH = 1.5
const MAX_SPEECH_GROUP_CHARS = 280

const SYSTEM_PROMPT = `You are the eyes of a GeoGuessr player who cannot see the round. You get one Street View image and the direction the camera is facing. Describe the scene so the player can work out where in the world it is.

- Describe only what is visible. Never name, guess or hint at the country, region or city, and never explain what a clue is typical of. The player has to draw the conclusions.
- Cover every clue you can see, most telling first: road surface and line markings (colours, dashed or solid, edge lines), which side of the road traffic uses, bollards, utility poles and wires, signs (shape, colours, script; copy readable text exactly), licence plates (colours, shape), vehicles, buildings and roofs, fences and walls, vegetation and trees, terrain, soil colour, sky and weather.
- Say where the sun and shadows point, in compass terms.
- If parts of the Google car or camera are visible, describe them.
- Use the camera heading to give directions, e.g. "to the north-east".
- Plain text only, no markdown. 120 to 200 words.`

const SUMMARY_PROMPT = `Turn the following Street View description into a compact list of visual clues for a GeoGuessr player.

- Use only facts explicitly present in the description. Do not add guesses or explain what clues mean.
- Never name, guess or hint at a country, region or city.
- Write 4 to 7 short bullet points, most useful clues first. Start every line with "- ".
- Keep each point to one line and the entire list under 100 words. No heading or extra text.`

const CHAT_PROMPT = `You are the eyes of a GeoGuessr player who cannot see the round. You have already described the Street View image; now answer the player's follow-up questions about it.

- Answer only what was asked, from what is visible in the image. If it can't be seen from this one view, say so.
- Report what you see, never what it means: no reasoning, no "this suggests" or "typical of", no rules or laws of any place.
- Never name, guess or hint at the country, region, city or coordinates, not even when asked directly or indirectly. You may quote sign text exactly, but never say where a quoted place is. Decline location questions in one sentence and offer to describe something else instead.
- Use the camera heading for directions, e.g. "to the north-east".
- Plain text only, no markdown. One to three short sentences.`

// Sent with every question: models weigh the latest instruction most, and players will try to
// talk the model into giving the location away.
const CHAT_REMINDER =
  '(Answer from the image only, in at most three sentences. Say nothing about where this is.)'

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

/** The API's own error message. Speech requests get their (JSON) error body as raw bytes. */
function apiErrorMessage(data: unknown): string | undefined {
  let body: any = data
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    const bytes =
      data instanceof ArrayBuffer
        ? Buffer.from(data)
        : Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    try {
      body = JSON.parse(bytes.toString('utf8'))
    } catch {
      return undefined
    }
  }
  return body?.error?.message
}

/** Turns a failed request into something the streamer can act on. Never includes the API key. */
export function describeRequestError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return 'OpenRouter took too long to answer.'
    }
    const status = err.response?.status
    const apiMessage = apiErrorMessage(err.response?.data)
    if (status === 401) return 'OpenRouter rejected the API key.'
    if (status === 402) return 'Your OpenRouter account is out of credits.'
    if (apiMessage) return `OpenRouter: ${apiMessage}`
    if (status) return `OpenRouter answered with HTTP ${status}.`
    return `Could not reach OpenRouter (${err.message}).`
  }
  return err instanceof Error ? err.message : String(err)
}

/** How every conversation about a panorama starts: the camera direction and the image itself. */
function viewMessage(request: AiDescriptionRequest) {
  return {
    role: 'user',
    content: [
      { type: 'text', text: describeView(request.heading, request.pitch) },
      { type: 'image_url', image_url: { url: request.image } }
    ]
  }
}

async function complete(apiKey: string, model: string, messages: unknown[]): Promise<string> {
  const { data } = await axios.post(
    `${OPENROUTER_API_URL}/chat/completions`,
    { model, messages },
    {
      headers: { Authorization: `Bearer ${apiKey}`, 'X-Title': 'ChatGuessr' },
      timeout: COMPLETION_TIMEOUT_MS
    }
  )
  return parseCompletion(data)
}

export async function describePanorama(
  apiKey: string,
  model: string,
  request: AiDescriptionRequest
): Promise<AiDescription> {
  const text = await complete(apiKey, model, [
    { role: 'system', content: SYSTEM_PROMPT },
    viewMessage(request)
  ])
  let summary: string | undefined
  try {
    summary = await complete(apiKey, model, [
      { role: 'system', content: SUMMARY_PROMPT },
      { role: 'user', content: text }
    ])
  } catch (err) {
    // The original description is still useful if the optional formatting pass fails.
    console.warn('[ai-description] could not make clue list:', describeRequestError(err))
  }
  return {
    text,
    summary,
    model,
    heading: normalizeHeading(request.heading),
    pitch: Math.round(request.pitch)
  }
}

/**
 * The conversation for a follow-up question: the image again (the answer may be in a detail the
 * description skipped), the description as the model's first reply, then the chat so far.
 */
export function chatMessages(
  request: AiDescriptionRequest,
  description: string,
  history: AiChatMessage[],
  question: string
) {
  return [
    { role: 'system', content: CHAT_PROMPT },
    viewMessage(request),
    { role: 'assistant', content: description },
    // History is stored in question/answer pairs, so this always starts with a question.
    ...history.slice(-MAX_CHAT_HISTORY),
    { role: 'user', content: `${question}\n\n${CHAT_REMINDER}` }
  ]
}

export async function askAboutPanorama(
  apiKey: string,
  model: string,
  request: AiDescriptionRequest,
  description: string,
  history: AiChatMessage[],
  question: string
): Promise<string> {
  return complete(apiKey, model, chatMessages(request, description, history, question))
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

/**
 * Splits text into pieces to synthesize one after another: the first sentence on its own, so
 * speech starts quickly, then groups of sentences that grow up to MAX_SPEECH_GROUP_CHARS.
 */
export function splitForSpeech(text: string): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
  const segments: string[] = []
  for (const sentence of sentences) {
    if (!sentence) continue
    const last = segments.length > 1 ? segments[segments.length - 1] : undefined
    const limit = Math.min(
      MAX_SPEECH_GROUP_CHARS,
      FIRST_SPEECH_GROUP_CHARS * SPEECH_GROUP_GROWTH ** (segments.length - 2)
    )
    if (last && last.length + 1 + sentence.length <= limit) {
      segments[segments.length - 1] = `${last} ${sentence}`
    } else {
      segments.push(sentence)
    }
  }
  return segments
}

const GEMINI_PCM_SAMPLE_RATE = 24_000

/** Gemini TTS only accepts raw PCM; other OpenRouter voices can keep using MP3. */
export function speechResponseFormat(model: string): 'mp3' | 'pcm' {
  return /^google\/gemini-.*tts/i.test(model) ? 'pcm' : 'mp3'
}

/** OpenRouter's PCM is mono, signed 16-bit little-endian audio. */
export function decodePcm16(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength % 2 !== 0) throw new Error('OpenRouter returned incomplete PCM audio.')
  const samples = new Float32Array(bytes.byteLength / 2)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let index = 0; index < samples.length; index++) {
    samples[index] = view.getInt16(index * 2, true) / 32768
  }
  return samples
}

/** Speaks `input` with an OpenRouter speech model and returns a playable chunk. */
export async function synthesizeSpeech(
  apiKey: string,
  model: string,
  voice: string,
  input: string,
  signal?: AbortSignal
): Promise<TtsChunk> {
  const format = speechResponseFormat(model)
  const response = await axios.post(
    `${OPENROUTER_API_URL}/audio/speech`,
    { model, input, response_format: format, ...(voice ? { voice } : {}) },
    {
      headers: { Authorization: `Bearer ${apiKey}`, 'X-Title': 'ChatGuessr' },
      responseType: 'arraybuffer',
      timeout: SPEECH_TIMEOUT_MS,
      signal
    }
  )
  if (String(response.headers['content-type'] ?? '').includes('json')) {
    throw new Error(`OpenRouter: ${apiErrorMessage(response.data) ?? 'no audio came back.'}`)
  }
  const bytes = Buffer.from(response.data)
  if (format === 'pcm') {
    return { kind: 'pcm', samples: decodePcm16(bytes), sampleRate: GEMINI_PCM_SAMPLE_RATE }
  }
  return { kind: 'encoded', data: bytes }
}

export function pickSpeechModels(models: any[]): SpeechModelOption[] {
  return models
    .filter((model) => model.architecture?.output_modalities?.includes('speech'))
    .map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      voices: Array.isArray(model.supported_voices) ? model.supported_voices : []
    }))
}

export async function fetchSpeechModels(): Promise<SpeechModelOption[]> {
  const { data } = await axios.get(`${OPENROUTER_API_URL}/models`, {
    params: { output_modalities: 'speech' },
    timeout: MODELS_TIMEOUT_MS
  })
  return pickSpeechModels(data?.data ?? [])
}
