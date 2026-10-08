<template>
  <div class="mode-settings">
    <div class="page-heading">
      <div>
        <h2>Mode settings</h2>
        <p>Combine modes and rules to build your game.</p>
      </div>
      <button class="btn bg-warning" @click="$emit('reset')">Reset modes</button>
    </div>

    <div class="active-summary" aria-live="polite">
      <span class="summary-label">Active rules · {{ activeRules.length }}</span>
      <span v-if="!activeRules.length" class="empty-summary"
        >Standard scoring, no extra rules.</span
      >
      <span v-for="rule in activeRules" :key="rule" class="active-rule">{{ rule }}</span>
    </div>

    <h3 class="section-heading">Game modes</h3>
    <div class="mode-grid">
      <ModeCard
        v-model:enabled="settings.isGameOfChickenModeActivated"
        title="Game of Chicken"
        description="The closest player gets no points next round. The final round is free."
      >
        <label class="form__group">
          5k avoids the penalty
          <input v-model="settings.chickenModeSurvivesWith5k" type="checkbox" />
        </label>
        <label class="form__group">
          5k always gives points
          <input v-model="settings.chickenMode5kGivesPoints" type="checkbox" />
        </label>
      </ModeCard>
      <ModeCard
        v-model:enabled="settings.isDartsMode"
        title="Darts"
        description="Try to finish as close as possible to a target score."
      >
        <label class="form__group">
          Target score
          <input v-model.number="settings.dartsTargetScore" type="number" />
        </label>
        <label class="form__group">
          Bust when over target
          <input v-model="settings.isDartsModeBust" type="checkbox" />
        </label>
      </ModeCard>
      <ModeCard
        v-model:enabled="settings.isBRMode"
        title="Reguess / Battle Royale"
        description="Allow a limited number of guess changes, with an optional points deduction."
        @update:enabled="onReguessChanged"
      >
        <label class="form__group">
          Guess changes per round
          <input v-model.number="settings.battleRoyaleReguessLimit" type="number" />
        </label>
        <label class="form__group">
          Points lost per reguess
          <input v-model.number="settings.battleRoyaleSubtractedPoints" type="number" />
        </label>
        <p class="option-hint">Enabling this turns off Allow guess changing in Game settings.</p>
      </ModeCard>
    </div>

    <h3 class="section-heading">Guess rules</h3>
    <div class="mode-grid">
      <ModeCard
        v-model:enabled="settings.isClosestInWrongCountryModeActivated"
        title="Wrong country only"
        description="Guesses in the correct country score zero points."
      />
      <ModeCard
        v-model:enabled="settings.exclusiveMode"
        title="Exclusive"
        description="Score only when nobody else guesses in your country."
      />
      <ModeCard
        title="Country sequence"
        description="Follow country name lengths, alphabetical order, or a sequence of letters."
        :active="settings.countdownMode !== 'normal'"
      >
        <label class="form__group">
          Rule
          <select v-model="settings.countdownMode">
            <option value="normal">Off</option>
            <option value="countdown">Countdown</option>
            <option value="countup">Countup</option>
            <option value="alphabeticalAZ">Alphabetical A → Z</option>
            <option value="alphabeticalZA">Alphabetical Z → A</option>
            <option value="abc">ABC</option>
          </select>
        </label>
        <label v-if="settings.countdownMode === 'abc'" class="form__group">
          Letter sequence
          <input v-model.trim="settings.ABCModeLetters" type="text" @keypress="onlyLetters" />
        </label>
      </ModeCard>
      <ModeCard
        title="Ocean plonks"
        description="Choose whether guesses on land or in international waters are allowed."
        :active="settings.waterPlonkMode !== 'normal'"
      >
        <label class="form__group">
          Rule
          <select v-model="settings.waterPlonkMode">
            <option value="normal">No restriction</option>
            <option value="mandatory">Ocean only</option>
            <option value="illegal">Land only</option>
          </select>
        </label>
      </ModeCard>
    </div>

    <h3 class="section-heading">Scoring</h3>
    <div class="mode-grid">
      <ModeCard
        v-model:enabled="settings.invertScoring"
        title="Antipode"
        description="Reverse distance scoring: farther from the location is better. For world maps with normal scoring."
      />
      <ModeCard
        title="Latitude / longitude"
        description="Score by coordinate differences instead of normal distance scoring."
        :active="settings.scoringMode !== 'off'"
      >
        <label class="form__group">
          Scoring method
          <select v-model="settings.scoringMode">
            <option value="off">Normal distance</option>
            <option value="latitude">Latitude</option>
            <option value="longitude">Longitude</option>
            <option value="latlng">Latitude + longitude</option>
          </select>
        </label>
      </ModeCard>
      <ModeCard
        title="Round multipliers"
        description="Apply a score multiplier each round."
        :active="settings.roundMultis !== 'off'"
      >
        <label class="form__group">
          Multiplier
          <select v-model="settings.roundMultis">
            <option value="off">Off</option>
            <option value="multiMerchant">Multi Merchant</option>
            <option value="random">Random</option>
          </select>
        </label>
        <label v-if="settings.roundMultis === 'random'" class="form__group">
          Reveal at round end only
          <input v-model="settings.showRandomMultisOnlyAtEndOfRound" type="checkbox" />
        </label>
      </ModeCard>
      <ModeCard
        title="Wrong country adjustment"
        description="Subtract points for a wrong country. A negative value adds points instead."
        :active="settings.modifierMinusPointsIfWrongCountry !== 0"
      >
        <label class="form__group">
          Points to subtract
          <input v-model.number="settings.modifierMinusPointsIfWrongCountry" type="number" />
        </label>
      </ModeCard>
      <ModeCard
        v-model:enabled="settings.allowMinus"
        title="Negative scores"
        description="Allow deductions to take a score below zero."
      />
    </div>

    <details class="experimental-section" @toggle="onExperimentalToggle">
      <summary>
        <span>Experimental features</span>
        <span class="experimental-label">Experimental</span>
        <span v-if="experimentalCount" class="experimental-count">
          {{ experimentalCount }} active
        </span>
      </summary>
      <div class="experimental-content">
        <p class="option-hint">Optional modes and AI tools. Expand a mode by enabling it.</p>
        <div class="mode-grid experimental-grid">
          <ModeCard
            v-model:enabled="settings.progressiveZoomModeEnabled"
            title="Progressive zoom"
            description="Start zoomed in and reveal the view over the CG timer. Earlier guesses preserve more points."
          >
            <label class="form__group">
              Points affected by time
              <input
                v-model.number="settings.progressiveZoomAffectedPoints"
                type="number"
                min="0"
                max="5000"
                step="100"
                @change="normalizeProgressiveZoomAffectedPoints"
              />
            </label>
            <p class="option-hint">
              At 2,500, half the accuracy score stays fixed and half falls with time.
            </p>
          </ModeCard>
          <ModeCard
            v-model:enabled="settings.isTMPZModeEnabled"
            title="TMPZ"
            description="Let Twitch chat move, pan, zoom, and reset the view. Type !tmpz for commands."
          />
          <ModeCard
            v-model:enabled="settings.peepholeModeEnabled"
            title="Peephole"
            description="Hide the view behind a mask. Chat moves a circular opening with !peephole commands."
          >
            <label class="form__group">
              Opening size
              <select v-model="settings.peepholeSize">
                <option value="tiny">Tiny</option>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </label>
          </ModeCard>
        </div>
        <div v-if="experimentalOpen" class="ai-settings">
          <slot name="experimental" />
        </div>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import ModeCard from './ui/ModeCard.vue'

const props = defineProps<{ settings: Settings }>()
const settings = props.settings
const emit = defineEmits<{
  (event: 'reset'): void
  (event: 'experimental-toggle', open: boolean): void
}>()
const experimentalOpen = shallowRef(false)
const experimentalCount = computed(
  () =>
    [
      settings.progressiveZoomModeEnabled,
      settings.isTMPZModeEnabled,
      settings.peepholeModeEnabled,
      settings.aiDescriptionMode,
      settings.ttsEnabled
    ].filter(Boolean).length
)

function onExperimentalToggle(event: Event) {
  experimentalOpen.value = (event.target as HTMLDetailsElement).open
  emit('experimental-toggle', experimentalOpen.value)
}

function normalizeProgressiveZoomAffectedPoints() {
  const points = Number(settings.progressiveZoomAffectedPoints)
  settings.progressiveZoomAffectedPoints = Number.isFinite(points)
    ? Math.max(0, Math.min(5000, Math.round(points)))
    : 5000
}

const sequenceNames: Record<string, string> = {
  countdown: 'Countdown',
  countup: 'Countup',
  alphabeticalAZ: 'Alphabetical A → Z',
  alphabeticalZA: 'Alphabetical Z → A',
  abc: 'ABC'
}
const scoringNames: Record<string, string> = {
  latitude: 'Latitude',
  longitude: 'Longitude',
  latlng: 'Latitude + longitude'
}

const activeRules = computed(() => {
  const rules: string[] = []
  if (settings.isGameOfChickenModeActivated) rules.push('Chicken')
  if (settings.isDartsMode) rules.push(`Darts · ${settings.dartsTargetScore}`)
  if (settings.isBRMode) rules.push('Reguess')
  if (settings.isClosestInWrongCountryModeActivated) rules.push('Wrong country only')
  if (settings.exclusiveMode) rules.push('Exclusive')
  if (settings.countdownMode !== 'normal') {
    rules.push(sequenceNames[settings.countdownMode] ?? settings.countdownMode)
  }
  if (settings.waterPlonkMode !== 'normal') {
    rules.push(settings.waterPlonkMode === 'mandatory' ? 'Ocean only' : 'Land only')
  }
  if (settings.invertScoring) rules.push('Antipode')
  if (settings.scoringMode !== 'off') {
    rules.push(scoringNames[settings.scoringMode] ?? settings.scoringMode)
  }
  if (settings.roundMultis !== 'off') {
    rules.push(settings.roundMultis === 'random' ? 'Random multipliers' : 'Multi Merchant')
  }
  if (settings.modifierMinusPointsIfWrongCountry !== 0) {
    rules.push(`Wrong country adjustment · ${settings.modifierMinusPointsIfWrongCountry}`)
  }
  if (settings.allowMinus) rules.push('Negative scores')
  if (settings.progressiveZoomModeEnabled) rules.push('Progressive zoom · Experimental')
  if (settings.isTMPZModeEnabled) rules.push('TMPZ · Experimental')
  if (settings.peepholeModeEnabled) rules.push('Peephole · Experimental')
  if (settings.aiDescriptionMode) rules.push('AI descriptions · Experimental')
  if (settings.ttsEnabled) rules.push('AI voice · Experimental')
  return rules
})

function onReguessChanged(enabled: boolean) {
  if (enabled) settings.isMultiGuess = false
}

function onlyLetters(event: KeyboardEvent) {
  if (event.key.length === 1 && !/^[A-Za-z]$/.test(event.key)) event.preventDefault()
}
</script>

<style scoped>
.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.page-heading h2 {
  margin: 0 0 0.35rem;
}

.page-heading p,
.option-hint {
  margin: 0;
  opacity: 0.7;
  font-size: 0.8rem;
  line-height: 1.5;
}

.active-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 8px;
  background: rgb(0 0 0 / 15%);
  font-size: 0.8rem;
}

.summary-label {
  font-weight: 700;
  margin-right: 0.25rem;
}

.empty-summary {
  opacity: 0.65;
}

.active-rule {
  padding: 0.25rem 0.5rem;
  border-radius: 5px;
  background: rgb(255 255 255 / 10%);
  color: var(--primary);
}

.section-heading {
  margin: 1.5rem 0 0.75rem;
  font-size: 0.85rem;
  letter-spacing: 0.04em;
  opacity: 0.75;
}

.mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 0.75rem;
}

.mode-grid :deep(.form__group) {
  height: auto;
  min-height: 24px;
  gap: 0.75rem;
  font-size: 0.85rem;
}

.mode-grid :deep(input[type='number']) {
  width: 100px;
  flex-shrink: 0;
}

.mode-grid :deep(select),
.mode-grid :deep(input[type='text']) {
  width: 175px;
  max-width: 60%;
  flex-shrink: 0;
}

.option-hint {
  margin-top: 0.5rem;
}

.experimental-section {
  margin-top: 1.5rem;
  border: 1px solid rgb(255 255 255 / 15%);
  border-radius: 10px;
}

.experimental-section summary {
  padding: 1rem;
  cursor: pointer;
  font-weight: 700;
}

.experimental-label,
.experimental-count {
  margin-left: 0.5rem;
  font-size: 0.75rem;
  font-weight: 400;
}

.experimental-label {
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  color: var(--warning);
  background: rgb(255 255 255 / 8%);
}

.experimental-count {
  color: var(--primary);
}

.experimental-content {
  padding: 0 1rem 1rem;
}

.experimental-grid {
  margin-top: 0.75rem;
}

.ai-settings {
  margin-top: 1rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgb(255 255 255 / 12%);
}

@media (max-width: 650px) {
  .mode-grid {
    grid-template-columns: 1fr;
  }
}
</style>
