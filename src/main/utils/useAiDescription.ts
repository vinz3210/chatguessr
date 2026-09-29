import { ipcMain } from 'electron'
import { store } from './store'
import { settings } from './useSettings'
import {
  askAboutPanorama,
  describePanorama,
  describeRequestError,
  fetchVisionModels
} from './openRouter'

// Each round keeps its image (~200 KB) so follow-up questions can look at it again.
const MAX_CACHED_ROUNDS = 20
const MAX_QUESTION_CHARS = 300

type Round = {
  request: AiDescriptionRequest
  description: AiDescription
  chat: AiChatMessage[]
}

/**
 * IPC for AI Description Mode. The renderer captures the panorama; everything that touches
 * the OpenRouter API key stays in the main process, because the renderer shares its window
 * with GeoGuessr's own scripts.
 */
export default function useAiDescription(getLocation: () => Location_ | undefined) {
  // Keyed by round location, so a page reload mid-round shows the same text and chat without
  // paying for them again.
  const rounds = new Map<string, Round>()
  let visionModels: Promise<AiModelOption[]> | undefined

  const locationKey = (location: LatLng) => `${location.lat},${location.lng}`
  const currentRound = () => {
    const location = getLocation()
    return location ? rounds.get(locationKey(location)) : undefined
  }

  const remember = (key: string, round: Round) => {
    rounds.delete(key)
    rounds.set(key, round)
    if (rounds.size > MAX_CACHED_ROUNDS) rounds.delete(rounds.keys().next().value!)
  }

  const apiKeyStatus = (): AiApiKeyStatus => {
    const apiKey = store.get('openRouterApiKey')
    return { isSet: !!apiKey, hint: apiKey ? `…${apiKey.slice(-4)}` : '' }
  }

  // Why a request can't be made, or null when it can.
  const missingSetup = () => {
    if (!store.get('openRouterApiKey')) {
      return 'No OpenRouter API key set. Add one in Settings → Mode settings.'
    }
    if (!settings.aiDescriptionModel.trim()) {
      return 'No AI model set. Pick one in Settings → Mode settings.'
    }
    return null
  }

  ipcMain.handle('ai-description:get-api-key-status', () => apiKeyStatus())

  ipcMain.handle('ai-description:set-api-key', (_event, apiKey: string) => {
    const trimmed = apiKey.trim()
    if (trimmed) {
      store.set('openRouterApiKey', trimmed)
    } else {
      store.delete('openRouterApiKey')
    }
    return apiKeyStatus()
  })

  ipcMain.handle('ai-description:list-models', () => {
    visionModels ??= fetchVisionModels().catch((err) => {
      console.error('[ai-description] could not load models:', describeRequestError(err))
      visionModels = undefined
      return []
    })
    return visionModels
  })

  ipcMain.handle('ai-description:get-cached', () => currentRound()?.description ?? null)

  ipcMain.handle(
    'ai-description:describe',
    async (_event, request: AiDescriptionRequest): Promise<AiDescriptionResult> => {
      const problem = missingSetup()
      if (problem) return { ok: false, error: problem }

      // Read before awaiting: the round may be over by the time the model answers.
      const location = getLocation()
      try {
        const description = await describePanorama(
          store.get('openRouterApiKey')!,
          settings.aiDescriptionModel.trim(),
          request
        )
        // A new description starts a new conversation.
        if (location) remember(locationKey(location), { request, description, chat: [] })
        return { ok: true, description }
      } catch (err) {
        // Log the message only: an axios error carries the Authorization header.
        const error = describeRequestError(err)
        console.error('[ai-description] request failed:', error)
        return { ok: false, error }
      }
    }
  )

  ipcMain.handle('ai-description:get-chat', () => currentRound()?.chat ?? [])

  ipcMain.handle('ai-description:ask', async (_event, question: string): Promise<AiChatResult> => {
    const problem = missingSetup()
    if (problem) return { ok: false, error: problem }
    const asked = String(question).trim().slice(0, MAX_QUESTION_CHARS)
    if (!asked) return { ok: false, error: 'Type a question first.' }
    const round = currentRound()
    if (!round) return { ok: false, error: 'Wait for the description to finish first.' }

    try {
      const answer = await askAboutPanorama(
        store.get('openRouterApiKey')!,
        settings.aiDescriptionModel.trim(),
        round.request,
        round.description.text,
        round.chat,
        asked
      )
      round.chat.push({ role: 'user', content: asked }, { role: 'assistant', content: answer })
      return { ok: true, answer }
    } catch (err) {
      const error = describeRequestError(err)
      console.error('[ai-description] question failed:', error)
      return { ok: false, error }
    }
  })
}
