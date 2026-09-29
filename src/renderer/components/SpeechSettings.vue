<template>
  <div>
    <p class="intro">
      Adds a speaker button to AI descriptions. Clicking it reads the description out with an
      OpenRouter voice, using the same API key as the descriptions. It's billed per character, and
      only what you click gets read.
    </p>
    <p v-if="!apiKeyStatus.isSet" class="message error">
      No OpenRouter API key yet. Add one in Mode settings → AI Description Mode.
    </p>

    <label class="form__group" data-tip="Off by default: every read-aloud is a paid request">
      Read AI descriptions aloud
      <input v-model="enabled" type="checkbox" />
    </label>

    <label
      class="form__group"
      data-tip="Any OpenRouter text-to-speech model (default: hexgrad/kokoro-82m)"
    >
      Voice model{{ isKnownModel ? '' : ' (not a known speech model)' }} :
      <input
        v-model.trim="model"
        type="text"
        list="cg-speech-models"
        spellcheck="false"
        style="width: 260px"
      />
    </label>
    <datalist id="cg-speech-models">
      <option v-for="option of models" :key="option.id" :value="option.id">
        {{ option.name }}
      </option>
    </datalist>

    <label
      class="form__group"
      :data-tip="
        voices.length ? `${voices.length} voices for this model` : 'Leave empty for the default'
      "
    >
      Voice :
      <input
        v-model.trim="voice"
        type="text"
        list="cg-speech-voices"
        spellcheck="false"
        style="width: 260px"
      />
    </label>
    <datalist id="cg-speech-voices">
      <option v-for="name of voices" :key="name" :value="name" />
    </datalist>

    <h3>Try it</h3>
    <div class="row">
      <input v-model="testText" type="text" spellcheck="false" class="flex-1" />
      <button class="btn bg-primary" :disabled="!enabled" @click="toggleTest()">
        {{
          testState === 'idle' ? '▶ Say it' : testState === 'loading' ? 'Generating… ■' : '■ Stop'
        }}
      </button>
    </div>
    <p v-if="!enabled" class="hint">Turn on "Read AI descriptions aloud" first.</p>
    <p v-if="message" class="message error">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { speak, type SpeechState } from '../speech'

const { chatguessrApi } = window

const props = defineProps<{
  /** Whether the tab is showing; the model list is only fetched once it is. */
  active: boolean
}>()
const enabled = defineModel<boolean>('enabled', { required: true })
const model = defineModel<string>('model', { required: true })
const voice = defineModel<string>('voice', { required: true })

const apiKeyStatus = shallowRef<AiApiKeyStatus>(await chatguessrApi.getAiApiKeyStatus())
const models = shallowRef<SpeechModelOption[]>([])
const message = shallowRef('')

watch(
  () => props.active,
  async (active) => {
    if (!active) return
    // The key may have been added in Mode settings since this opened.
    apiKeyStatus.value = await chatguessrApi.getAiApiKeyStatus()
    if (models.value.length === 0) models.value = await chatguessrApi.getSpeechModels()
  },
  { immediate: true }
)

const selectedModel = computed(() => models.value.find((option) => option.id === model.value))
const voices = computed(() => selectedModel.value?.voices ?? [])
const isKnownModel = computed(() => models.value.length === 0 || !!selectedModel.value)

// Voices are per model; switching models picks the new model's first voice unless the current one
// also exists there.
watch(model, () => {
  if (voices.value.length > 0 && !voices.value.includes(voice.value)) voice.value = voices.value[0]
})

const testText = shallowRef("Hello chat! Let's find out where in the world we are this time.")
const testState = shallowRef<SpeechState>('idle')
let stopTest: (() => void) | null = null

function toggleTest() {
  if (testState.value !== 'idle') {
    stopTest?.()
    return
  }
  message.value = ''
  stopTest = speak(
    testText.value,
    (state, error) => {
      testState.value = state
      if (error) message.value = error
    },
    // Trying out another voice on the same sentence should play the new voice.
    { reuse: false }
  )
}

onBeforeUnmount(() => stopTest?.())
</script>

<style scoped>
.intro {
  line-height: 1.4;
  opacity: 0.85;
}

h3 {
  margin: 1rem 0 0.5rem;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.hint {
  font-size: 0.85rem;
  opacity: 0.7;
}

.message {
  margin: 0.5rem 0;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  background: rgb(255 255 255 / 8%);
}
.message.error {
  color: var(--danger);
}
</style>
