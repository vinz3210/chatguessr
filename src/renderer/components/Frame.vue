<template>
  <div :class="['cg-frame-container', { hidden: gameState === 'none' }]">
    <transition name="scoreboard_modal">
      <Scoreboard
        v-show="widgetVisibility.scoreboardAndGgInterfaceVisible"
        ref="scoreboard"
        :game-state
        :is-multi-guess
        :is-b-r-mode
        :mode-help
        :on-round-result-row-click
        :on-game-result-row-click
      />
    </transition>
    <div id="debugElement" style="background: hotpink; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 1.5rem; display:none;">
      <b>Debug stuff!</b>
      <div id="map" style="height: 400px; width: 100%;"></div>
    <div id="pano" style="height: 400px; width: 100%;"></div>


    </div>
    <Timer
      :game-state
      :class="{ hidden: gameState !== 'in-round' || !widgetVisibility.timerVisible }"
    />
  </div>

  <div class="cg-menu">
    <button
      :class="['cg-button', twitchConnectionState.state]"
      title="Settings"
      @click="settingsVisible = true"
    >
      <IconGear />
    </button>

    <button class="cg-button" title="Show/Hide Leaderboard" @click="leaderboardVisible = true">
      <IconLeaderboard />
    </button>

    <button
      class="cg-button"
      title="Show/Hide Scoreboard"
      :hidden="gameState === 'none'"
      @click="()=>{
        let newState = !widgetVisibility.scoreboardAndGgInterfaceVisible
        widgetVisibility.scoreboardAndGgInterfaceVisible = newState; 
        widgetVisibility.timerVisible = newState;}"
    >
      <IconScoreboardVisible v-if="widgetVisibility.scoreboardAndGgInterfaceVisible" />
      <IconScoreboardHidden v-else />
    </button>
    
    <button
      class="cg-button"
      title="Randomplonk for Streamer"
      id="streamerRandomplonkButton"
      :hidden="gameState === 'none'"
      @click="onStreamerRandomplonk"
    >
      <IconDice v-if="widgetVisibility.scoreboardAndGgInterfaceVisible" />
      <IconDice v-else />
    </button>

    <button
      class="cg-button"
      title="Center view"
      :hidden="!satelliteMode.value.enabled || gameState !== 'in-round'"
      @click="onClickCenterSatelliteView"
    >
      <IconStartFlag />
    </button>

    <button
      class="cg-button"
      title="Spin 360° Left"
      :hidden="gameState !== 'in-round'"
      @click="onSpinLeft360"
    >
      <IconRotateRight />
    </button>
    
    <button
      class="cg-button"
      title="unblink"
      :hidden="!blinkMode.value.enabled || gameState !== 'in-round'"
      @click="onClickUnblink"
    >
      <IconEyeShut />
    </button>
  </div>

  <Suspense>
    <Modal :is-visible="settingsVisible" @close="settingsVisible = false">
      <Settings :socket-connection-state :twitch-connection-state />
    </Modal>
  </Suspense>

  <Suspense>
    <Modal :is-visible="leaderboardVisible" @close="leaderboardVisible = false">
      <Leaderboard />
    </Modal>
  </Suspense>
</template>

<script lang="ts" setup>
import { shallowRef, reactive, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { useStyleTag } from '@vueuse/core'
import { getLocalStorage, setLocalStorage } from '@/useLocalStorage'

import Settings from './Settings.vue'
import Modal from './ui/Modal.vue'
import Scoreboard from './Scoreboard.vue'
import Leaderboard from './Leaderboard/Leaderboard.vue'
import Timer from './Timer.vue'

import IconDice from '@/assets/icons/dice.svg'
import IconRotateRight from '@/assets/icons/rotate-right.svg'
import IconGear from '@/assets/icons/gear.svg'
import IconLeaderboard from '@/assets/icons/leaderboard.svg'
//import IconTimerVisible from '@/assets/icons/timer_visible.svg'
//import IconTimerHidden from '@/assets/icons/timer_hidden.svg'
import IconScoreboardVisible from '@/assets/icons/scoreboard_visible.svg'
import IconScoreboardHidden from '@/assets/icons/scoreboard_hidden.svg'
import IconStartFlag from '@/assets/icons/start_flag.svg'
import IconEyeShut from '@/assets/icons/eye_shut.svg'
import { rendererApi } from '../rendererApi'
const { chatguessrApi } = window

// probably not necessary
// defineOptions({
//   inheritAttrs: false
// })

const scoreboard = shallowRef<InstanceType<typeof Scoreboard> | null>(null)
const settingsVisible = shallowRef(false)
const leaderboardVisible = shallowRef(false)

const gameState = shallowRef<GameState>('none')
const isMultiGuess = shallowRef<boolean>(false)
const isBRMode = shallowRef<boolean>(false)
const modeHelp = shallowRef<string[]>([])
const guessMarkersLimit = shallowRef<number | null>(null)
const currentLocation = shallowRef<LatLng | null>(null)
const gameResultLocations = shallowRef<Location_[] | null>(null)


var MWStreetViewInstance

var MWStreetViewInstance
let spinInterval: NodeJS.Timeout | null = null

// Make sure game mode is not set to 'challenge'
setLocalStorage('quickplay-playtype', 'single')

// Make sure game mode is not set to 'challenge'
setLocalStorage('quickplay-playtype', 'single')

const widgetVisibility = reactive(
  getLocalStorage('cg_widget__visibility', {
    scoreboardVisible: true,
    scoreboardAndGgInterfaceVisible: true,
    timerVisible: true
  })
)
watch(widgetVisibility, () => {
  setLocalStorage('cg_widget__visibility', widgetVisibility)
  if(!widgetVisibility.scoreboardAndGgInterfaceVisible) {
    gameStatusRemover.load()
  }
  else {
    gameStatusRemover.unload()
  }
})

// removing game status element and map
const gameStatusRemover = useStyleTag('[class^="game_status"], [class^="game_guessMap"] { display: none; }', {
  id: 'cg-game-status-remover',
  manual: true
})



const satelliteMode = {
  get value(): { enabled: boolean } {
    return getLocalStorage('cg_satelliteMode__settings', { enabled: false })
  }
}

const blinkMode = {
  get value(): { enabled: boolean } {
    return getLocalStorage('cg_blinkMode__settings', { enabled: false })
  }
}

// Remove the game's own markers while on a results screen (where we draw our own)
const markerRemover = useStyleTag(
  '[data-qa="result-view-top"] [data-qa="guess-marker"], [class^="coordinate-result-map_line__"] { display: none; }',
  {
    id: 'cg-marker-remover',
    manual: true
  }
)
const removeMarkers = computed(
  () => gameState.value === 'round-results' || gameState.value === 'game-results'
)
watch(
  removeMarkers,
  (load) => {
    if (load) {
      markerRemover.load()
    } else {
      markerRemover.unload()
    }
  },
  { immediate: true }
)

// Remove the game's controls when in satellite mode.
const gameControlsRemover = useStyleTag(
  '[class^="styles_columnTwo__"], [class^="styles_controlGroup__"], [data-qa="compass"], [class^="panorama-compass_"] { display: none !important; }',
  {
    id: 'cg-game-controls-remover',
    manual: true
  }
)
// `satelliteMode` is not actually reactive, but the actual change we're interested in is in `gameState` anyways.
const removeGameControls = computed(() => gameState.value !== 'none' && satelliteMode.value.enabled)
watch(
  removeGameControls,
  (load) => {
    if (load) {
      gameControlsRemover.load()
    } else {
      gameControlsRemover.unload()
    }
  },
  { immediate: true }
)
// Create an observer to watch for:
// - URL starting with https://www.geoguessr.com/maps
// - Button existing with className starting with button_button


const pickNextMap = (mapId: String = "62a44b22040f04bd36e8a914") => {
  // get the mapId of the current site if it is a map
  const currentMapId = window.location.pathname.split('/').pop();
  if (currentMapId === mapId) {
    console.log("Already on the desired map, not navigating.");
    return;
  }
  window.location.href = `https://www.geoguessr.com/maps/${mapId}`;
}

/**
 * The original mutation handling logic extracted to run after navigation/load completes.
 */
function runMutationHandler(mutations: MutationRecord[] | null) {
  // If autoStartNextGame is enabled, skip
  if (getLocalStorage('autoStartNextGame', false)) {
    return
  }

  // Keep original behavior: look for PLAY buttons and click
  if (!mutations) return
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      const buttons = document.querySelectorAll("[class^='button_button']");
      buttons.forEach((button) => {
        if (button instanceof HTMLElement && button.innerText === "PLAY") {
          console.log("Clicking on play button");
          button.click();
          setLocalStorage('autoStartNextGame', false);
          newGameObserver.disconnect(); // Stop observing once the button is clicked
        }
      });
    }
  }
}

const newGameObserver = new MutationObserver((mutations) => {


  // Wait for navigation/load to complete, then run the original logic.
  // Use the 'load' event on window to detect when the new page is loaded. If already loaded,
  // schedule the handler on next tick.
  const runAfterLoad = () => {
    try {
      runMutationHandler(mutations as MutationRecord[])
    } catch (e) {
      console.error(e)
    }
  }

  // If the document is already in 'complete' state, run immediately next tick
  if (document.readyState === 'complete') {
    // small timeout ensures any DOM changes settle after navigation
    setTimeout(runAfterLoad, 1500)
  } else {
    const onLoad = () => {
      window.removeEventListener('load', onLoad)
      setTimeout(runAfterLoad, 1500)
    }
    window.addEventListener('load', onLoad)
  }
});

// Start observing the document for changes
newGameObserver.observe(document.body, { childList: true, subtree: true });





async function showRandomMultiMessageInScoreboard(){
  await chatguessrApi.getSettings().then((settings) => {
    if(settings.showRandomMultisOnlyAtEndOfRound)
      document.querySelector('.scoreboard')?.querySelectorAll("span").forEach((el) => {
        if (el.innerText.includes("Random Multi")) {
          el.style.display = "block"
        }
      })
  })
}

async function handleTryAgain() {
  const maxRetries = 3;
  for (let i = 0; i < maxRetries; i++) {
    const tryAgainButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.innerText.toLowerCase().includes('try again')
    );

    if (tryAgainButton) {
      console.log('Found "Try again" button. Clicking it...');
      tryAgainButton.click();
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      // Button not found, so we can stop checking.
      console.log('"Try again" button not found. Continuing...');
      return;
    }
  }

  // Final check after all retries
  const finalCheckButton = Array.from(document.querySelectorAll('button')).find(
    (button) => button.innerText.toLowerCase().includes('try again')
  );

  if (finalCheckButton) {
    console.error('"Try again" button is still visible after 3 retries.');
  }
}

onBeforeUnmount(
  chatguessrApi.onGameStarted(async(_isMultiGuess, _isBRMode, _modeHelp, restoredGuesses, location) => {
    // call handleTryAgain but wait for 2 seconds before starting
    setTimeout(async () => {
      await handleTryAgain()
    }, 2000);
    isMultiGuess.value = _isMultiGuess
    isBRMode.value = _isBRMode
    console.log("isBRMode", isBRMode.value)
    
    modeHelp.value = _modeHelp
    gameState.value = 'in-round'
    


    currentLocation.value = location
    if (satelliteMode.value.enabled) {
      rendererApi.showSatelliteMap(location)
    } else {
      rendererApi.hideSatelliteMap()
    }
    
    scoreboard.value!.onStartRound()
    if (restoredGuesses.length > 0) {
      if (isMultiGuess.value) {
        scoreboard.value!.restoreMultiGuesses(restoredGuesses as Player[])
      } else {
        scoreboard.value!.restoreGuesses(restoredGuesses as RoundResult[])
      }
    }
    rotationFunction()

    sendPano()
  })
)

onBeforeUnmount(
  chatguessrApi.onRoundStarted(async(_modeHelp) => {
    gameState.value = 'in-round'
    modeHelp.value = _modeHelp
    }
  )
)

// send pano to backend
function sendPano() {
  window.setTimeout(() => {
    let pano = MWStreetViewInstance.getPano()
    chatguessrApi.sendPano(pano)
  }, 500)
}
function getClosestHeadingPano(currentHeading: number, streetViewInstance): string | boolean{
  let links = streetViewInstance.getLinks()
  let linksByDistance: { heading: number, distance: number, panoId: string }[] = []
  links.map(link=>{
    let heading = link.heading
    let distance = Math.abs(heading - currentHeading)
    linksByDistance.push({heading: heading, distance: distance, panoId: link.pano})
  })
  let closestDistance = Math.min(...linksByDistance.map(link=>link.distance))
  if(closestDistance > 60){
    return false
  }
  let closestLink = linksByDistance.find(link=>link.distance === closestDistance)
  if(!closestLink) return false
  return closestLink.panoId
}
async function rotationFunction(){
      const settings = await chatguessrApi.getSettings()

    if (settings.autorotateAtStart) {
      setTimeout(() => {
        console.log("!!!!!!!!!!!!!!!")
        onSpinLeft360()
      }, 1000)
    }
}

onBeforeUnmount(
  chatguessrApi.onStartRound(async() => {
    await handleTryAgain()
        // console.log all settings
    gameState.value = 'in-round'
    rendererApi.clearMarkers()
    scoreboard.value!.onStartRound()
    try{
      sendPano()
    }catch(e){
      console.error(e)
    }
    rotationFunction()
  })
)
onBeforeUnmount(
  chatguessrApi.onRefreshRound(async(location) => {

    // this condition prevents gameState to switch to 'in-round' if 'onRefreshRound' is triggered (happens sometimes) on round results screen
    // this is because of "did-frame-finish-load" based logic, ideally we would want something else
    if (gameState.value !== 'round-results') gameState.value = 'in-round'
    //console.log(settings, "settings")
    currentLocation.value = location
    if (satelliteMode.value.enabled) {
      rendererApi.showSatelliteMap(location)
    }
    
  })
)
declare global {
  interface Window {
    initialize: () => void;
  }
}
onBeforeUnmount(
  chatguessrApi.onMoveForward(() => {
    // get latlng of pano in front of us
    let pov = MWStreetViewInstance.getPov()
    console.log("initial heading", pov.heading)
    let pano = getClosestHeadingPano(pov.heading, MWStreetViewInstance)
    if(!pano) return
    console.log("closest heading", pano)
    MWStreetViewInstance.setPano(pano)
    console.log(MWStreetViewInstance, "MWStreetViewInstance")

return 0



    function initialize() {
  let fenway = { lat: 48.196102579488475, lng: 16.21028423309326};
  const mapElement = document.getElementById("map") as HTMLElement;
  const map = new google.maps.Map(mapElement, {
    center: fenway,
    zoom: 14
  });
  const panoElement = document.getElementById("pano") as HTMLElement;






const request = {
  location: fenway,
  preference: google.maps.StreetViewPreference.NEAREST, // Set the preference
  radius: 5000 // Search within a 50-meter radius
};

const streetViewService = new google.maps.StreetViewService();
let closestPanoId;
let lat;
let lng;
streetViewService.getPanorama(request, (panoramaData, status) => {
  console.log("panoramaData", panoramaData)
  console.log("status", status)
  if (status === google.maps.StreetViewStatus.OK) {
    console.log("panoramaData", panoramaData)
    if(!panoramaData) return
    if(!panoramaData.location) return
    closestPanoId = panoramaData.location.pano;
    if(!panoramaData.location.latLng) return
    lat = panoramaData.location.latLng.lat();
    lng = panoramaData.location.latLng.lng();
    console.log('Closest Street View panorama ID:', closestPanoId);
    fenway = { lat: lat, lng: lng};
console.log("fenway", fenway)


const panorama = new google.maps.StreetViewPanorama(
    panoElement,
    {
      position: fenway,
      pov: {
        heading: 34,
        pitch: 10
      },
      
    }
  );
  map.setStreetView(panorama);

  } else {
    console.error('Street View data is not available for this location.');
  }
});





}

window.initialize = initialize
window.initialize()
console.log("after init")

    })
)


onBeforeUnmount(
  
chatguessrApi.onMoveBackward(()=>{
  let pov = MWStreetViewInstance.getPov()
  let heading = (pov.heading + 180) % 360
  let pano = getClosestHeadingPano(heading, MWStreetViewInstance)
  if(!pano) return
  MWStreetViewInstance.setPano(pano)
  })
)

onBeforeUnmount(
  chatguessrApi.onPanLeft((degrees) => {
    let pov = MWStreetViewInstance.getPov()
    let heading = pov.heading
    let pitch = pov.pitch
    let newHeading = heading - degrees
    MWStreetViewInstance.setPov({heading: newHeading, pitch: pitch})
  })
)
onBeforeUnmount(
  chatguessrApi.onPanRight((degrees) => {
    let pov = MWStreetViewInstance.getPov()
    let heading = pov.heading
    let pitch = pov.pitch
    let newHeading = heading + degrees
    MWStreetViewInstance.setPov({heading: newHeading, pitch: pitch})
  })
)
onBeforeUnmount(
  chatguessrApi.onPanUp((degrees) => {
    let pov = MWStreetViewInstance.getPov()
    let heading = pov.heading
    let pitch = pov.pitch
    let newPitch = pitch + degrees
    
    if(newPitch > 89) newPitch = 89
    MWStreetViewInstance.setPov({heading: heading, pitch: newPitch})
  })
)
onBeforeUnmount(
  chatguessrApi.onPanDown((degrees) => {
    let pov = MWStreetViewInstance.getPov()
    let heading = pov.heading
    let pitch = pov.pitch
    let newPitch = pitch - degrees
    if(newPitch < -89) newPitch = -89
    MWStreetViewInstance.setPov({heading: heading, pitch: newPitch})
  })
)
onBeforeUnmount(
  chatguessrApi.onZoomIn((value) => {
    let zoom = MWStreetViewInstance.getZoom()
    let newZoom = zoom + value
    MWStreetViewInstance.setZoom(newZoom)
  })
)
onBeforeUnmount(
  chatguessrApi.onZoomOut((value) => {
    let zoom = MWStreetViewInstance.getZoom()
    let newZoom = zoom - value
    MWStreetViewInstance.setZoom(newZoom)
  })
)

onBeforeUnmount(
  chatguessrApi.onRetrieveMyLastLoc(async (location, username, locationNumber) => {
    console.log("locationnumber", locationNumber)
    function computeDistanceBetween(coords1, coords2) {
      return google.maps.geometry.spherical.computeDistanceBetween(
        coords1,
        coords2,
      );
    }
    function makeMapsUrlPanoId(panoId: string): string {
      return `https://www.google.com/maps/@?api=1&map_action=pano&pano=${panoId}`
    }

    let searchRadius = 250000
    let radius = searchRadius
    let oldRadius = searchRadius
    let pano = {
      radius: 0,
      url: ''
    }
    //let closestPanoId;
    const streetViewService = new google.maps.StreetViewService();
    while (true) {
      try {
      let panorama = await streetViewService.getPanorama({
        location: {lat: location.lat, lng: location.lng},
        preference: google.maps.StreetViewPreference.NEAREST, // Set the preference
        source: google.maps.StreetViewSource.OUTDOOR, // Get outdoor panoramas
        radius: radius // Search within a 5000-meter radius
      });
      if(!panorama) return
      if(!panorama.data) return
      if(!panorama.data.location) return
      radius = computeDistanceBetween({lat: location.lat, lng: location.lng}, panorama.data.location.latLng);
      pano.radius = radius;
      pano.url = makeMapsUrlPanoId(panorama.data.location.pano);
 
      if (oldRadius && radius >= oldRadius) break;
      oldRadius = radius;
    } catch (e) {
      console.error(e)
      break;
    }
  }
  chatguessrApi.returnMyLastLoc(pano.url, username, locationNumber)        











  })
)

onBeforeUnmount(
  chatguessrApi.onGameQuit(() => {
    gameState.value = 'none'
    rendererApi.clearMarkers()
  })
)

let pickNextMapUnsub: (() => void) | null = null;

onMounted(() => {
  const maybeUnsub = (chatguessrApi.onPickNextMap as any)((mapId: string) => {
    pickNextMap(mapId)
  })
  if (typeof maybeUnsub === 'function') {
    pickNextMapUnsub = maybeUnsub
  }
})

onBeforeUnmount(() => {
  if (pickNextMapUnsub) {
    pickNextMapUnsub()
    pickNextMapUnsub = null
  }
})

onBeforeUnmount(
  chatguessrApi.onReceiveGuess((guess) => {
    scoreboard.value!.renderGuess(guess)
  })
)

onBeforeUnmount(
  chatguessrApi.onReceiveMultiGuesses((guess) => {
    try {
    guess["index"] = 0
    guess["totalScore"] = 0
    scoreboard.value!.renderMultiGuess(guess)
    } catch (e) {
      console.error(e)
    }
  })
)

onBeforeUnmount(
  chatguessrApi.onShowRoundResults(async (round, location, roundResults, _guessMarkersLimit) => {

    // Stop spinning when round ends
    if (spinInterval) {
      clearInterval(spinInterval);
      spinInterval = null;
    }
        // console.log all settings
    showRandomMultiMessageInScoreboard()
    gameState.value = 'round-results'
    guessMarkersLimit.value = _guessMarkersLimit

    rendererApi.drawRoundResults(location, roundResults, _guessMarkersLimit)
    scoreboard.value!.showRoundResults(round, roundResults)
  })
)

onBeforeUnmount(
  chatguessrApi.onShowGameResults((locations, gameResults) => {
    gameState.value = 'game-results'
    gameResultLocations.value = locations

    rendererApi.drawPlayerResults(locations, gameResults[0])
    scoreboard.value!.showGameResults(gameResults)
  })
)

onBeforeUnmount(
  chatguessrApi.onGuessesOpenChanged((open) => {
    scoreboard.value!.setSwitchState(open)
  })
)

function onRoundResultRowClick(index: number, position: LatLng) {
  if (guessMarkersLimit.value && index <= guessMarkersLimit.value) {
    rendererApi.focusOnGuess(position)
  }
}
function onGameResultRowClick(row: GameResultDisplay) {
  if (gameResultLocations.value) {
    rendererApi.drawPlayerResults(gameResultLocations.value, row)
  }
}

function onClickCenterSatelliteView() {
  if (currentLocation.value) rendererApi.centerSatelliteView(currentLocation.value)
}
function onClickUnblink() {
  if (blinkMode.value.enabled) {
    const mapRoot = document.querySelector('[data-qa=panorama]') as HTMLElement
    if (mapRoot) {
      // Toggle brightness between 0% and 100%
      const current = mapRoot.style.filter;
      if (current === 'brightness(0%)') {
        mapRoot.style.filter = 'brightness(100%)';
      } else {
        mapRoot.style.filter = 'brightness(0%)';
      }
    }
  }
}

async function onSpinLeft360() {
  console.log("onSpinLeft360 called")
  // If already spinning, stop the current spin
  if (spinInterval) {
    clearInterval(spinInterval);
    spinInterval = null;
    return;
  }

  const settings = reactive<Settings>(await chatguessrApi.getSettings())
  // get the heading from the backend

  let location_backend = await chatguessrApi.getCurrentLocation()
  console.log("location_backend", location_backend)

  console.log("onSpinLeft360")
  // Perform a smooth 360° spin to the left over 2 seconds (2000ms)
  const pov = MWStreetViewInstance.getPov();
  let povstr = JSON.stringify(pov)
  console.log("pov", povstr)
  var startHeading = pov.heading;
  var pitch = pov.pitch;

  var invertRotation = false;

  if(startHeading === location_backend?.heading) {
    pitch = location_backend.pitch;
  }
  if (pitch > 90 || pitch < -90) {
    invertRotation = true;
  }
  const duration = settings.rotationDuration*1000; // ms
  var steps = 1440;
  if(settings.rotationDuration > 15){
    steps = steps * 2
  }
  let currentStep = 0;
  const stepSize = 360 / steps;
  const interval = duration / steps;

  spinInterval = setInterval(() => {
    if (invertRotation) {
      currentStep--;
    } else {
      currentStep++;
    }
    var newHeading = (startHeading + (stepSize * currentStep) + 360) % 360;
    MWStreetViewInstance.setPov({ heading: newHeading, pitch });
    if (Math.abs(currentStep) >= steps) {
      if (spinInterval) {
        clearInterval(spinInterval);
        spinInterval = null;
      }
    }
  }, interval);
  
}

async function onStreamerRandomplonk() {
  let latlng = await chatguessrApi.getRandomPlonkLatLng()
  let {lat,lng} = {lat: latlng.lat, lng: latlng.lng}
    
 

 
    // Okay well played Geoguessr u got me there for a minute, but below should work.
    // Below is the only intentionally complicated part of the code - it won't be simplified or explained for good reason.
    // let element = document.getElementsByClassName("guess-map_canvas__JAHHT")[0]
    let element = document.querySelectorAll('[class^="guess-map_canvas__"]')[0]

    let keys = Object.keys(element)
    let key = keys.find(key => key.startsWith("__reactFiber$"))
    if (!key) return
    let props = element[key]
    let x = props.return.return.memoizedProps.map.__e3_.click
    let objectKeys = Object.keys(x)
    let y = objectKeys[objectKeys.length - 1]
 
    const z = {
        latLng:{
            lat: () => lat,
            lng: () => lng,
        }
    }
 
    const xy = x[y]
    const a = Object.keys(x[y])
 
    for(let i = 0; i < a.length ;i++){
        let q = a[i]
        if (typeof xy[q] === "function"){
            xy[q](z)
        }
    }
    window.setTimeout(() => {
        // click button element with data-qa="perform-guess"
        const buttonElement = document.querySelector('[data-qa="perform-guess"]')
        buttonElement?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    }, 200)
}

/** Load and update twitch connection state. */
const twitchConnectionState = useTwitchConnectionState()
function useTwitchConnectionState() {
  const conn = shallowRef<TwitchConnectionState>({ state: 'disconnected' })

  onMounted(async () => {
    const state = await chatguessrApi.getTwitchConnectionState()
    conn.value = state


    function overrideOnLoad(googleScript, observer, overrider) {
  const oldOnload = googleScript.onload
  googleScript.onload = (event) => {
      const google = window.google
      if (google) {
          observer.disconnect()
          overrider(google)
      }
      if (oldOnload) {
          oldOnload.call(googleScript, event)
      }
  }
}
 
function grabGoogleScript(mutations) {
  for (const mutation of mutations) {
      for (const newNode of mutation.addedNodes) {
          const asScript = newNode
          if (asScript && asScript.src && asScript.src.startsWith('https://maps.googleapis.com/')) {
              return asScript
          }
      }
  }
  return null
}
 
function injecter(overrider) {
  if (document.documentElement)
  {
      injecterCallback(overrider);
  }
}
 
function injecterCallback(overrider)
{
  new MutationObserver((mutations, observer) => {
      const googleScript = grabGoogleScript(mutations)
      if (googleScript) {
          overrideOnLoad(googleScript, observer, overrider)
      }
  }).observe(document.documentElement, { childList: true, subtree: true })
}
 

  injecter(() => {
    google.maps.StreetViewPanorama = class extends google.maps.StreetViewPanorama {
      constructor(...args: any[]) {
          super(...args as [any, ...any[]]);
          MWStreetViewInstance = this;
      }
    }
  });

console.log(MWStreetViewInstance, "MWStreetViewInstance")




  })

  onBeforeUnmount(
    chatguessrApi.onTwitchConnectionStateChange((state) => {
      conn.value = state
    })
  )

  onBeforeUnmount(
    chatguessrApi.onTwitchError((err) => {
      conn.value = { state: 'error', error: err }
    })
  )

  return conn
}

/** Load and update socket connection state. */
const socketConnectionState = useSocketConnectionState()
function useSocketConnectionState() {
  const conn = shallowRef<SocketConnectionState>({ state: 'disconnected' })

  onMounted(async () => {
    const state = await chatguessrApi.getSocketConnectionState()
    conn.value = state
  })

  onBeforeUnmount(
    chatguessrApi.onSocketConnected(() => {
      conn.value.state = 'connected'
    })
  )
  onBeforeUnmount(
    chatguessrApi.onSocketDisconnected(() => {
      conn.value.state = 'disconnected'
    })
  )

  return conn
}
</script>

<style scoped>
[hidden] {
  display: none !important;
}

.cg-frame-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  pointer-events: none;
}

.cg-menu {
  position: fixed;
  display: flex;
  flex-direction: column;
  gap: 5px;
  top: 120px;
  right: 7px;
  z-index: 1;
}

.cg-button {
  display: flex;
  width: 2.7rem;
  height: 2.7rem;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 50px;
  cursor: pointer;
  transition: 0.2s;
}

.cg-button:hover {
  background: rgba(0, 0, 0, 0.5);
}
.cg-button:active {
  transform: scale(0.9);
}

.cg-button.disconnected {
  background: red;
}

.cg-button.connecting {
  background: blue;
}

/* Vue draggable-resizable */
.drv,
.vdr-container {
  border: none;
  z-index: 2;
}


</style>
