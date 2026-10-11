<template>
  <div class="container">
    <Tabs :tabs :current-tab @change="(tab) => (currentTab = tab)" />

    <div v-show="currentTab === 'game-settings'" class="content">
      <h2>Game Settings</h2>
      <ModeCard
        class="auto-cg-card"
        v-model:enabled="settings.autoCgEnabled"
        title="AutoCG"
        description="Use the CG timer to plonk for the streamer, advance rounds, and start the next game automatically. Start the first game yourself."
      >
        <label class="form__group">
          Show round and game results (seconds)
          <input
            v-model.number="settings.autoCgResultsSeconds"
            type="number"
            min="3"
            max="120"
            @change="normalizeAutoCgResultsSeconds"
          />
        </label>
        <label class="form__group">
          Let chat vote for the next map
          <input v-model="settings.autoCgMapVoting" type="checkbox" />
        </label>
        <p>Voting starts in round 3. With voting off, AutoCG replays the same map.</p>
        <p>Use the AutoCG button to pause or resume. Round length comes from the CG timer settings.</p>
      </ModeCard>
      <div class="ml-05">
        <label
          class="form__group"
          data-tip="Players can change their guess. Streaks, scores & distances won't be displayed on the scoreboard"
        >
          Allow guess changing
          <input v-model="settings.isMultiGuess" type="checkbox" />
        </label>
        <label
          class="form__group"
          data-tip="Drawing too much guess markers on the map may affect performance (default: 30)"
        >
          Guess markers limit ({{ settings.guessMarkersLimit }}) :
          <input
            v-model.number="settings.guessMarkersLimit"
            type="range"
            min="10"
            step="5"
            max="200"
          />
        </label>
        <label
          class="form__group"
          data-tip="Only Randomplonks"
        >
          Only Randomplonks
          <input v-model="settings.isRandomPlonkOnlyMode" type="checkbox" />
        </label>
        <label
          class="form__group"
          data-tip="Start Rotation on Start of Round"
        >
          Auto rotate on Start of Round
          <input v-model="settings.autorotateAtStart" type="checkbox" />
        </label>
      </div>
      <hr />

      <h2>Twitch notifications</h2>
      <div class="ml-05">
        <div class="grid-col">
          <div>
            <label class="form__group" data-tip="Display &lt;User&gt; has guessed">
              <i>&lt;User&gt; has guessed</i>
              <input v-model="settings!.showHasGuessed" type="checkbox" />
            </label>
            <label class="form__group" data-tip="Display &lt;User&gt; has already guessed">
              <i>&lt;User&gt; has already guessed</i>
              <input v-model="settings.showHasAlreadyGuessed" type="checkbox" />
            </label>
            <label class="form__group" data-tip="Display &lt;User&gt; guess changed">
              <i>&lt;User&gt; guess changed</i>
              <input v-model="settings.showGuessChanged" type="checkbox" />
            </label>
            <label class="form__group" data-tip="Display &lt;User&gt; submitted previous guess">
              <i>&lt;User&gt; submitted previous guess</i>
              <input v-model="settings.showSubmittedPreviousGuess" type="checkbox" />
            </label>
            <label class="form__group" data-tip="Display A new seed of &lt;Map&gt; has started.">
              <i>A new seed of &lt;Map&gt; has started</i>
              <input v-model="settings.showNewSeedStarted" type="checkbox" />
            </label>
            <label class="form__group" data-tip="Display best Randomplonk after Round">
              <i>Display best Randomplonk after Round</i>
              <input v-model="settings.showBestRandomplonkRound" type="checkbox" />
            </label>
          </div>
          <div>
            <label class="form__group" data-tip="Show Guesses are open.">
              <i>Show Guesses are open</i>
              <input v-model="settings.showGuessesAreOpen" type="checkbox" />
            </label>
            <label class="form__group" data-tip="Show Guesses are closed.">
              <i>Show Guesses are closed.</i>
              <input v-model="settings.showGuessesAreClosed" type="checkbox" />
            </label>
            <label class="form__group" data-tip="Show Round has started.">
              <i>Show Round has started.</i>
              <input v-model="settings.showRoundStarted" type="checkbox" />
            </label>
            <label class="form__group" data-tip="Show Round has finished.">
              <i>Show Round has finished.</i>
              <input v-model="settings.showRoundFinished" type="checkbox" />
            </label>
            <label class="form__group" data-tip="Show Game finished.">
              <i>Show Game finished.</i>
              <input v-model="settings.showGameFinished" type="checkbox" />
            </label>
            <label class="form__group" data-tip="Auto Show Mode at start of Seed.">
              <i>Show Mode Message at start of seed.</i>
              <input v-model="settings.autoShowMode" type="checkbox" />
            </label>
          </div>
        </div>
        

      </div>
      <hr />

      <h2>Twitch commands <small>(leave empty to disable)</small></h2>
      <div class="ml-05">
        <div class="grid-col">
          <div>
            <label class="form__group" data-tip="Get ChatGuessr map link (default: !cg)">
              Get ChatGuessr map :
              <input v-model.trim="settings.cgCmd" type="text" spellcheck="false" />
            </label>
            <textarea v-model="settings.cgMsg" spellcheck="false" rows="3"></textarea>
            <label class="form__group" data-tip="ChatGuessr map cooldown (default: 30)">
              ChatGuessr map cooldown ({{ settings.cgCmdCooldown }} sec) :
              <input
                v-model.number="settings.cgCmdCooldown"
                type="range"
                min="0"
                step="5"
                max="120"
              />
            </label>
            <label class="form__group" data-tip="Get user stats in chat  (default: !me)">
              Get user stats :
              <input v-model.trim="settings.getUserStatsCmd" type="text" spellcheck="false" />
            </label>
            <label class="form__group" data-tip="Clear user stats (default: !clear)">
              Clear user stats :
              <input v-model.trim="settings.clearUserStatsCmd" type="text" spellcheck="false" />
            </label>
            <label class="form__group" data-tip="Get channel best stats (default: !best)">
              Get channel best stats :
              <input v-model.trim="settings.getBestStatsCmd" type="text" spellcheck="false" />
            </label>
          </div>

          <div>
            <label class="form__group" data-tip="Get flags list  (default: !flags)">
              Get flags list :
              <input v-model.trim="settings.flagsCmd" type="text" spellcheck="false" />
            </label>
            <label class="form__group" data-tip="Guess random coordinates (default: !randomplonk)">
              Random plonk :
              <input v-model.trim="settings.randomPlonkCmd" type="text" spellcheck="false" />
            </label>
            
            <label class="form__group" data-tip="Allow Country Random Plonk.">
              <i>Allow Country Random Plonk.</i>
              <input v-model="settings.countryRandomPlonkAllowed" type="checkbox" />
            </label>
            <label class="form__group" data-tip="Guess random coordinates in Water (default: !randomplonkwater)">
              Random plonk in international waters:
              <input v-model.trim="settings.randomPlonkWaterCmd" type="text" spellcheck="false" />
            </label>
            <label class="form__group" data-tip="Get the last location (default: !lastloc)">
              Get the last location :
              <input v-model.trim="settings.lastlocCmd" type="text" spellcheck="false" />
            </label>
            <label class="form__group" data-tip="Get current map description (default: !map)">
              Get current map description :
              <input v-model.trim="settings.mapCmd" type="text" spellcheck="false" />
            </label>
            <label class="form__group" data-tip="Get current mode description (default: !mode)">
              Get current mode description :
              <input v-model.trim="settings.modeCmd" type="text" spellcheck="false" />
            </label>
            <label class="form__group" data-tip="Map description cooldown  (default: 30)">
              Map description cooldown ({{ settings.mapCmdCooldown }} sec) :
              <input
                v-model.number="settings.mapCmdCooldown"
                type="range"
                min="0"
                step="5"
                max="120"
              />
            </label>
            <label class="form__group" data-tip="Auto rotate 360° duration in s (default: 15)">
              Auto rotate 360° duration in s ({{ settings.rotationDuration }} sec) :
              <input
                v-model.number="settings.rotationDuration"
                type="range"
                min="4"
                step="1"
                max="120"
              />
            </label>
          </div>
        </div>
      </div>




      <div class="flex items-center flex-col gap-05 mt-1">
        <small>ChatGuessr version {{ currentVerion }}</small>
      </div>
    </div>

    
    <div v-show="currentTab === 'mode-settings'" class="content">
      <ModeSettings
        :settings="settings"
        @reset="resetModeSettings"
        @experimental-toggle="(open) => (experimentalOpen = open)"
      >
        <template #experimental>
          <div class="experimental-ai">
            <h2>AI Description Mode</h2>
            <div class="ml-05">
              <label
                class="form__group"
                data-tip="Hides the Street View and shows an AI-written description of it instead"
              >
                AI Description Mode
                <input v-model="settings.aiDescriptionMode" type="checkbox" />
              </label>
              <div
                class="form__group"
                data-tip="Create a key at openrouter.ai/keys. It is only stored on this computer"
              >
                OpenRouter API key
                {{ aiApiKeyStatus.isSet ? `(saved ${aiApiKeyStatus.hint})` : '(not set)' }} :
                <div class="flex gap-02">
                  <input
                    v-model.trim="aiApiKeyInput"
                    type="password"
                    placeholder="sk-or-…"
                    spellcheck="false"
                    autocomplete="off"
                    style="width: 200px"
                    @keyup.enter="saveAiApiKey(aiApiKeyInput)"
                  />
                  <button
                    class="btn bg-primary"
                    :disabled="!aiApiKeyInput"
                    @click="saveAiApiKey(aiApiKeyInput)"
                  >
                    Save
                  </button>
                  <button v-if="aiApiKeyStatus.isSet" class="btn bg-danger" @click="saveAiApiKey('')">
                    Remove
                  </button>
                </div>
              </div>
              <label
                class="form__group"
                data-tip="Any OpenRouter model that accepts images (default: google/gemini-3.8-flash)"
              >
                AI model{{ isKnownVisionModel ? '' : ' (not a known image model)' }} :
                <input
                  v-model.trim="settings.aiDescriptionModel"
                  type="text"
                  list="cg-ai-models"
                  spellcheck="false"
                  style="width: 260px"
                />
              </label>
              <datalist id="cg-ai-models">
                <option v-for="model of aiModels" :key="model.id" :value="model.id">
                  {{ model.name }}
                </option>
              </datalist>
            </div>

            <hr />
            <h2>AI voice <small>(reads AI descriptions aloud)</small></h2>
            <LocalVoiceSettings
              v-if="settings.ttsProvider === 'local'"
              v-model:enabled="settings.ttsEnabled"
            />
            <SpeechSettings
              v-else
              v-model:enabled="settings.ttsEnabled"
              v-model:model="settings.ttsModel"
              v-model:voice="settings.ttsVoice"
              :active="currentTab === 'mode-settings' && experimentalOpen"
              :api-key-status="aiApiKeyStatus"
            />
          </div>

        </template>
      </ModeSettings>
      <div class="flex items-center flex-col gap-05 mt-1">
        <small>ChatGuessr version {{ currentVerion }}</small>
      </div>
    </div>

    <div v-show="currentTab === 'messages'" class="content">
  
      <h2>Message Settings</h2>
      <div class="ml-05">
        <label class="form__group long" data-tip="Display &lt;emoji&gt; &lt;user&gt; has guessed">
          &lt;emoji&gt; &lt;user&gt; has guessed
          <input v-model="settings.messageHasGuessed" spellcheck="false" />

            </label>
        <label class="form__group long" data-tip="Display &lt;user&gt; has already guessed">
          &lt;user&gt; has already guessed
          <input v-model="settings.messageHasAlreadyGuessed" spellcheck="false" />

            </label>
        <label class="form__group long" data-tip="Display &lt;emoji&gt; &lt;user&gt; guess changed">
          &lt;emoji&gt; &lt;user&gt; guess changed
          <input v-model="settings.messageGuessChanged" spellcheck="false" />

            </label>
        <label class="form__group long" data-tip="Display &lt;user&gt; submitted their previous guess">
          &lt;user&gt; submitted their previous guess!
          <input v-model="settings.messageSubmittedPreviousGuess" spellcheck="false" />

            </label>
        <label class="form__group long" data-tip="Display 🌎 A new seed of &lt;map&gt; has started ">
          🌎 A new seed of &lt;map&gt; has started
          <input v-model="settings.messageNewSeedStarted" spellcheck="false" />
        </label>
        <label class="form__group long" data-tip="Display Guesses are open...">
          Guesses are open...
          <input v-model="settings.messageGuessesAreOpen" spellcheck="false" />
        </label>
        <label class="form__group long" data-tip="Guesses are closed.">
          Guesses are closed.
          <input v-model="settings.messageGuessesAreClosed" spellcheck="false" />
        </label>
        <label class="form__group long" data-tip="🌎 Round <round> has started">
          🌎 Round &lt;round&gt; has started
          <input v-model="settings.messageRoundStarted" spellcheck="false" />
        </label>
        <label class="form__group long" data-tip="🌎 Round <round> has finished. Congrats <emoji> <username>!">
          🌎 Round &lt;round&gt; has finished. Congrats &lt;emoji&gt; &lt;username&gt;!
          <input v-model="settings.messageRoundFinished" spellcheck="false" />
        </label>
        <label class="form__group long" data-tip="🌎 Game finished. Congrats <emoji> <username>! 🏆 Game Summary: <link>">
          🌎 Game finished. Congrats &lt;emoji&gt; &lt;username&gt;! 🏆<br/> Game Summary: &lt;link&gt;
          <input v-model="settings.messageGameFinished" spellcheck="false" />
        </label>
      </div>
      <hr/>
      <h2>Best Message Setting</h2>
      <div class="ml-05">
        <label
          class="form__group"
          data-tip="Include Streamer Data in !best command"
        >
        Include Streamer Data in !best command
          <input v-model="settings.includeBroadcasterDataInBest" type="checkbox" />
        </label>
      </div>
      
      <hr />


      <h2>Gift Points Settings</h2>
      <div class="ml-05">

        <label class="form__group" data-tip="<command> <username> <amount>">
              Command for the gift of points:
              <input v-model.trim="settings.pointGiftCommand" type="text" spellcheck="false" />
            </label>

        <label
          class="form__group"
          data-tip="Gift points per Round"
        >
          Gift Points Round
          <input v-model="settings.isGiftingPointsRound" type="checkbox" />
        </label>
      </div>
      
      <label class="form__group" data-tip="Points gifted per Round">
              Gift points per Round:
              <input v-model.trim="settings.roundPointGift" type="number" spellcheck="false" />
            </label>
      
      <div class="ml-05">
        <label
          class="form__group"
          data-tip="Gift points per Round"
        >
          Gift Points Game
          <input v-model="settings.isGiftingPointsGame" type="checkbox" />
        </label>
      </div>
      
      <label class="form__group" data-tip="Points gifted per Game">
        Points gifted per Game:
        <input v-model.trim="settings.gamePointGift" type="number" spellcheck="false" />
      </label>
      <hr />
      <h2>Bot Random Plonk</h2>

            
      <label class="form__group" data-tip="Send Message at start of Round">
        Send Message at start of Round (if connected to Bot Account, Bot needs Mod Rights):
        <input v-model="settings.isStartOfRoundCommandActive" type="checkbox" />
      </label>
            
      <label class="form__group" data-tip="Message at start of Round">
        Message at start of Round:
        <input v-model.trim="settings.startOfRoundCommand" type="text" spellcheck="false" />
      </label>





    </div>

    <div v-show="currentTab === 'twitch-connect'" class="content">
      <div class="flex flex-col items-center justify-center gap-05 my-1">
        <IconTwitch class="mb-1" />
        Your bot account :
        <span :class="[twitchConnectionState.state]"
          >{{
            twitchConnectionState.state === 'connected'
              ? 'connected as ' + twitchConnectionState.botUsername
              : twitchConnectionState.state === 'error'
                ? 'Error: ' + twitchConnectionState.error
                : twitchConnectionState.state
          }}
        </span>
        <div class="form__group">
          <button
            :class="['btn', twitchConnectionState.state]"
            @click="chatguessrApi.replaceSession()"
          >
            {{
              twitchConnectionState.state === 'disconnected'
                ? 'Login'
                : twitchConnectionState.state === 'connecting'
                  ? 'Connecting...'
                  : 'Change account'
            }}
          </button>
        </div>
        Your streaming channel :
        <div class="form__group">
          <div class="flex gap-02">
            <input v-model="newChannelName" type="text" spellcheck="false" required />
            <button
              :disabled="newChannelName === settings.channelName"
              class="btn bg-primary"
              @click="onChannelNameUpdate()"
            >
              Update
            </button>
          </div>
        </div>
      </div>
      <h2>Status :</h2>
      <div class="ml-05">
        <div class="form__group">
          Twitch :<span :class="[twitchConnectionState.state]">{{
            twitchConnectionState.state
          }}</span>
        </div>
        <div class="form__group">
          ChatGuessr server :<span :class="[socketConnectionState.state]"
            >{{ socketConnectionState.state }}
            <button
              v-if="socketConnectionState.state === 'connecting'"
              :class="['btn', socketConnectionState.state]"
              @click="chatguessrApi.reconnect()"
            >
              ⟳
            </button>
          </span>
        </div>
        <div class="form__group">
          Your cg link :
          <div class="flex gap-02">
            <input
              :value="
                twitchConnectionState.state === 'connected'
                  ? `chatguessr.com/map/${twitchConnectionState.botUsername}`
                  : ''
              "
              type="text"
              style="width: 240px"
              disabled
            />
            <button class="btn bg-primary" style="width: 85px" @click="copy(cgLink)">
              {{ copied ? '✔️ Copied' : '🖊️ Copy' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-show="currentTab === 'userscripts'" class="content">
      <h2>Userscripts <small>(Tampermonkey compatible)</small></h2>
      <Userscripts />
    </div>

    <div v-show="currentTab === 'ban-list'" class="content">
      <div class="form__group">
        <div class="flex gap-03">
          <input
            v-model.trim="newBannedUser"
            type="text"
            spellcheck="false"
            @keyup.enter="addBannedUser()"
          />
          <button type="button" class="btn bg-danger" @click="addBannedUser()">Ban User</button>
        </div>
      </div>
      <h3>Banned users :</h3>
      <div class="flex flex-wrap gap-03 mb-1">
        <span
          v-for="(user, index) of bannedUsers"
          :key="index"
          class="badge bg-danger"
          title="Unban user"
          @click="removeBannedUser(index, user)"
          >{{ user.username }}</span
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { shallowRef, shallowReactive, reactive, watch, computed } from 'vue'
import { useClipboard } from '@vueuse/core'
import Tabs from './ui/Tabs.vue'
import ModeSettings from './ModeSettings.vue'
import ModeCard from './ui/ModeCard.vue'
import Userscripts from './Userscripts.vue'
import LocalVoiceSettings from './LocalVoiceSettings.vue'
import SpeechSettings from './SpeechSettings.vue'
import IconTwitch from '@/assets/icons/twitch.svg'

const { chatguessrApi } = window
const { copy, copied } = useClipboard()

const { socketConnectionState, twitchConnectionState } = defineProps<{
  twitchConnectionState: TwitchConnectionState
  socketConnectionState: SocketConnectionState
}>()

const currentTab = shallowRef(
  twitchConnectionState.state === 'disconnected' ? 'twitch-connect' : 'game-settings'
)
const experimentalOpen = shallowRef(false)
const tabs = [
  { name: 'game-settings', value: 'Game settings' },
  { name: 'mode-settings', value: 'Mode settings' },
  { name: 'twitch-connect', value: 'Twitch connect' },
  { name: 'ban-list', value: 'Ban list' },
  { name: 'messages', value: 'Messages' },
  { name: 'userscripts', value: 'Userscripts' }
]

const settings = reactive<Settings>(await chatguessrApi.getSettings())
const emit = defineEmits<{
  (event: 'peephole-settings-change', enabled: boolean, size: Settings['peepholeSize']): void
  (event: 'progressive-zoom-settings-change', enabled: boolean): void
}>()
watch(settings, () => {
  chatguessrApi.saveSettings(JSON.parse(JSON.stringify(settings)))
})
watch(() => settings.progressiveZoomModeEnabled, (enabled) => emit('progressive-zoom-settings-change', enabled))
watch(
  () => [settings.peepholeModeEnabled, settings.peepholeSize] as const,
  ([enabled, size]) => emit('peephole-settings-change', enabled, size)
)

const newChannelName = shallowRef(settings.channelName)
const onChannelNameUpdate = () => {
  settings.channelName = newChannelName.value
  chatguessrApi.reconnect()
}

const cgLink = shallowRef(
  twitchConnectionState.state === 'connected'
    ? `chatguessr.com/map/${twitchConnectionState.botUsername}`
    : ''
)

const bannedUsers = shallowReactive<{ username: string }[]>(await chatguessrApi.getBannedUsers())
const newBannedUser = shallowRef('')
const addBannedUser = () => {
  if (!newBannedUser.value) return
  bannedUsers.push({ username: newBannedUser.value })
  chatguessrApi.addBannedUser(newBannedUser.value)
  newBannedUser.value = ''
}

const removeBannedUser = (index: number, user: { username: string }) => {
  chatguessrApi.deleteBannedUser(user.username)
  bannedUsers.splice(index, 1)
}

const currentVerion = shallowRef(await chatguessrApi.getCurrentVersion())

// The API key never enters `settings`; the page only learns whether one is saved.
const aiApiKeyStatus = shallowRef<AiApiKeyStatus>(await chatguessrApi.getAiApiKeyStatus())
const aiApiKeyInput = shallowRef('')
const saveAiApiKey = async (apiKey: string) => {
  aiApiKeyStatus.value = await chatguessrApi.setAiApiKey(apiKey)
  aiApiKeyInput.value = ''
}

// Fetch model lists only when the experimental section is visible.
const aiModels = shallowRef<AiModelOption[]>([])
watch(
  () => currentTab.value === 'mode-settings' && experimentalOpen.value,
  async (active) => {
    if (active && aiModels.value.length === 0) {
      aiModels.value = await chatguessrApi.getAiVisionModels()
    }
  },
  { immediate: true }
)
const isKnownVisionModel = computed(
  () =>
    aiModels.value.length === 0 ||
    aiModels.value.some((model) => model.id === settings.aiDescriptionModel)
)

const resetModeSettings = () => {
  // Reset all mode settings to their default values
  settings.isTMPZModeEnabled = false
  settings.peepholeModeEnabled = false
  settings.peepholeSize = 'small'
  settings.progressiveZoomModeEnabled = false
  settings.progressiveZoomAffectedPoints = 5000
  settings.aiDescriptionMode = false
  settings.ttsEnabled = false
  settings.isClosestInWrongCountryModeActivated = false
  settings.invertScoring = false
  settings.exclusiveMode = false
  settings.allowMinus = false
  settings.roundMultis = "off"
  settings.showRandomMultisOnlyAtEndOfRound = false
  settings.scoringMode = "off"
  settings.isGameOfChickenModeActivated = false
  settings.chickenModeSurvivesWith5k = false
  settings.chickenMode5kGivesPoints = false
  settings.isDartsMode = false
  settings.isDartsModeBust = false
  settings.dartsTargetScore = 25000
  settings.isBRMode = false
  settings.battleRoyaleReguessLimit = 3
  settings.battleRoyaleSubtractedPoints = 0
  settings.countdownMode = "normal"
  settings.ABCModeLetters = "ABCDE"
  settings.waterPlonkMode = "normal"
  settings.modifierMinusPointsIfWrongCountry = 0
}

function normalizeAutoCgResultsSeconds() {
  const seconds = Number(settings.autoCgResultsSeconds)
  settings.autoCgResultsSeconds = Number.isFinite(seconds)
    ? Math.max(3, Math.min(120, Math.round(seconds)))
    : 5
}

</script>

<style scoped>
.auto-cg-card {
  margin-bottom: 1rem;
}

textarea {
  min-height: 85px;
}
h2 small {
  font-size: 0.8rem;
}

.container {
  width: 870px;
  min-height: 635px;
}

.content {
  padding: 0.5rem 1rem;
  max-height: 80vh;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 24px;
}

.grid-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-gap: 1rem;
}

.btn.connected {
  background: var(--primary);
}
span.connected {
  color: var(--primary);
}

.btn.connecting {
  background: var(--warning);
}
span.connecting {
  color: var(--warning);
}

.btn.disconnected,
.btn.error {
  background: var(--danger);
}

span.disconnected,
span.error {
  color: var(--danger);
}

.badge {
  cursor: pointer;
  padding: 0.3rem 0.5rem;
  border-radius: 5px;
  box-shadow: 1px 0 4px #00000073;
}

[data-tip] {
  position: relative;
}
[data-tip]:before,
[data-tip]:after {
  display: none;
  position: absolute;
  z-index: 1;
}
[data-tip]:before {
  content: '';
  top: 22px;
  right: 4px;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-bottom: 8px solid rgb(127 127 127);
}
[data-tip]:after {
  content: attr(data-tip);
  top: 30px;
  right: 0;
  padding: 0.7rem 1rem;
  text-align: center;
  color: #ffffff;
  background: rgb(127 127 127);
  border-radius: 4px;
}
[data-tip]:hover:after,
[data-tip]:hover:before {
  display: block;
}
</style>
