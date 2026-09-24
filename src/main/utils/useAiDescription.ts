import { ipcMain } from 'electron'
import { store } from './store'
import { settings } from './useSettings'
import { describePanorama, describeRequestError, fetchVisionModels } from './openRouter'

const MAX_CACHED_DESCRIPTIONS = 50

/**
 * IPC for AI Description Mode. The renderer captures the panorama; everything that touches
 * the OpenRouter API key stays in the main process, because the renderer shares its window
 * with GeoGuessr's own scripts.
 */
export default function useAiDescription(getLocation: () => Location_ | undefined) {
  // Keyed by round location, so a page reload mid-round shows the same text without paying
  // for a second request.
  const descriptionCache = new Map<string, AiDescription>()
  let visionModels: Promise<AiModelOption[]> | undefined

  const locationKey = (location: LatLng) => `${location.lat},${location.lng}`

  const remember = (key: string, description: AiDescription) => {
    descriptionCache.delete(key)
    descriptionCache.set(key, description)
    if (descriptionCache.size > MAX_CACHED_DESCRIPTIONS) {
      descriptionCache.delete(descriptionCache.keys().next().value!)
    }
  }

  const apiKeyStatus = (): AiApiKeyStatus => {
    const apiKey = store.get('openRouterApiKey')
    return { isSet: !!apiKey, hint: apiKey ? `…${apiKey.slice(-4)}` : '' }
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

  ipcMain.handle('ai-description:get-cached', () => {
    const location = getLocation()
    return (location && descriptionCache.get(locationKey(location))) ?? null
  })

  ipcMain.handle(
    'ai-description:describe',
    async (_event, request: AiDescriptionRequest): Promise<AiDescriptionResult> => {
      const apiKey = store.get('openRouterApiKey')
      if (!apiKey) {
        return {
          ok: false,
          error: 'No OpenRouter API key set. Add one in Settings → Mode settings.'
        }
      }
      const model = settings.aiDescriptionModel.trim()
      if (!model) {
        return { ok: false, error: 'No AI model set. Pick one in Settings → Mode settings.' }
      }

      // Read before awaiting: the round may be over by the time the model answers.
      const location = getLocation()
      try {
        const description = await describePanorama(apiKey, model, request)
        if (location) remember(locationKey(location), description)
        return { ok: true, description }
      } catch (err) {
        // Log the message only: an axios error carries the Authorization header.
        const error = describeRequestError(err)
        console.error('[ai-description] request failed:', error)
        return { ok: false, error }
      }
    }
  )
}
