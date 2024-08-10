import { ipcMain } from 'electron'
import { once } from 'events'
import { io } from 'socket.io-client'
import Game from './Game'
import TwitchBackend from './utils/useTwitchJS'
import { settings, saveSettings } from './utils/useSettings'
import countryIso from 'coordinate_to_country'

import {
  isGameURL,
  makeGameSummaryLink,
  makeMapsUrl,
  fetchMap,
  parseCoordinates,
  getRandomCoordsInLand,
  getRandomCoordsNotInLand,
  getStreamerAvatar,
  parseUserDate
} from './utils/gameHelper'
import { getEmoji, randomCountryFlag, selectFlag } from './lib/flags/flags'
import streakCodes from './lib/streakCodes.json'
import countryCodeCountdown from './lib/countryCodeCountdown.json'

const SOCKET_SERVER_URL =
  import.meta.env.VITE_SOCKET_SERVER_URL ?? 'https://chatguessr-server.herokuapp.com'

export default class GameHandler {
  #db: Database

  #win: Electron.BrowserWindow

  #session: Session | undefined

  #backend: TwitchBackend | undefined

  #socket: Socket | undefined

  #game: Game

  #requestAuthentication: () => Promise<void>

  constructor(
    db: Database,
    win: Electron.BrowserWindow,
    options: { requestAuthentication: () => Promise<void> }
  ) {
    this.#db = db
    this.#win = win
    this.#backend = undefined
    this.#socket = undefined
    this.#game = new Game(db, settings)
    this.#requestAuthentication = options.requestAuthentication
    this.init()
  }

  openGuesses() {
    this.#game.openGuesses()
    this.#win.webContents.send('switch-on')
    if(settings.showGuessesAreOpen)
      this.#backend?.sendMessage(settings.messageGuessesAreOpen, { system: true })
  }

  closeGuesses() {
    this.#game.closeGuesses()
    this.#win.webContents.send('switch-off')
    if(settings.showGuessesAreClosed)
    this.#backend?.sendMessage(settings.messageGuessesAreClosed, { system: true })
  }

  nextRound(isRestartClick: boolean = false) {
    if (this.#game.isFinished) {
      this.#game.finishGame()
      this.#showGameResults()
    } else {
      this.#win.webContents.send('next-round', this.#game.isMultiGuess, this.#game.getLocation())
      if(settings.showRoundStarted && !isRestartClick)
        this.#backend?.sendMessage(settings.messageRoundStarted.replace("<round>", this.#game.round.toString()), { system: true })
      this.openGuesses()
    }
  }

  returnToMapPage() {
    const mapUrl = this.#game.seed?.map
    this.#win.loadURL(`https://www.geoguessr.com/maps/${mapUrl}/play`)
  }

  #showRoundResults(location: Location_, roundResults: RoundResult[]) {
    const round = this.#game.isFinished ? this.#game.round : this.#game.round - 1

    this.#win.webContents.send(
      'show-round-results',
      round,
      location,
      roundResults,
      settings.guessMarkersLimit
    )
    if(settings.showRoundFinished)
    this.#backend?.sendMessage(
      settings.messageRoundFinished.replace('<emoji>', getEmoji(roundResults[0].player.flag)).replace('<username>', roundResults[0].player.username).replace("<round>", round.toString()),
      { system: true }
    )
    if(settings.showBestRandomplonkRound){
      let randomResults = roundResults.filter(result=>result.isRandomPlonk)
      if(randomResults.length){
        let bestRandomPlonk = randomResults[0]
        if (bestRandomPlonk) {
          let distance = bestRandomPlonk.distance
          let unit = 'km'
          let distanceNumber = "0"
          if (distance < 1) {
            distanceNumber = (distance * 1000).toFixed(2)
            unit = 'm'
          }
          else {
            distanceNumber = distance.toFixed(2)
          }
          let msg = `Best Random Plonk: ${bestRandomPlonk.score} points (${distanceNumber} ${unit}) by ${bestRandomPlonk.player.username}. `
          this.#backend?.sendMessage(msg, { system: true })
        }
      }      
    }
    if(this.#game.isGiftingPointsRound && this.#game.roundPointGift > 0 && this.#game.pointGiftCommand !== "")
    this.#backend?.sendMessage(
      `${this.#game.pointGiftCommand} ${
        roundResults[0].player.username
      } ${this.#game.roundPointGift}`,
      { system: false }
    )

  }

  dartsSort(a,b){
    let diff_a = Math.abs(a.totalScore - settings.dartsTargetScore)
    let diff_b = Math.abs(b.totalScore - settings.dartsTargetScore)
    return diff_a - diff_b
  }

  async getCountryNameLenght(countryCode:string): Promise<number | boolean> {

    let country = streakCodes[countryCode].toLowerCase()
    if (country === undefined) {
      return false
    }
    let countryName = countryCodeCountdown.find(x=>x.code === country)?.names
    if (countryName === undefined) {
      return false
    }
    return countryName.length
    
  }

  convertLatLngToCountdownName(lat: number, lng: number): string | boolean {
    let countryIsos = countryIso(lat, lng, true)
    if(countryIsos.length === 0){
      return false
    }
    let countryName = countryCodeCountdown.find(x=>x.code == streakCodes[countryIsos[0]].toLowerCase())
    if (countryName === undefined) {
      return false
    }
    return countryName.names
  }

  async #showGameResults() {
    var gameResults = this.#game.getGameResults()

    if(settings.countdownMode !== "normal"){
      gameResults.forEach(gameResult=>{
        let countdownDisqualified = false
        let countdownLength: number[] = []
        let countdownCountries: (string | boolean)[] = []
        gameResult.guesses.every((guess)=>{
          let lat = guess?.lat
          let lng = guess?.lng
          if(lat === undefined || lng === undefined){
            lat = 0
            lng = 0
          }
          let countryName = this.convertLatLngToCountdownName(lat, lng)

          countdownCountries.push(countryName)
          return true;
        })

        gameResult.guesses.every((guess)=>{
          if(countdownDisqualified)
            return false;
          let lat = guess?.lat
          let lng = guess?.lng
          if(lat === undefined || lng === undefined){
            lat = 0
            lng = 0
          }
          let countryName = this.convertLatLngToCountdownName(lat, lng)
          if(countryName === false){
            countdownDisqualified = true
            return false;
          }
          else{
            //this wont happen because the convertLatLngToCountdownName function will always return a false or string
            countryName = countryName as string
          }
          let countryNameLenght = countryName.replaceAll(" ", "").length

          countdownLength.push(countryNameLenght)
          return true;
        })
        gameResult.countdownCountries = countdownCountries.map(x=>{
          if(x === false || x === true){
            return "Invalid"
          }
          else{
            return `${x.replaceAll(" ", "")} (${x.replaceAll(" ", "").length})` 
          }
        }).join(" => ")
        if(countdownDisqualified){
          gameResult.isCountdownDisqualified = true
        }
        if(settings.countdownMode === "countdown"){
          // check if the coundownLength is in descending order
          let isSorted = countdownLength.every((val, i, arr) => !i || val < arr[i - 1]);
          if(!isSorted){
            gameResult.isCountdownDisqualified = true
          }
        }
        if(settings.countdownMode === "countup"){
          // check if the coundownLength is in ascending order
          let isSorted = countdownLength.every((val, i, arr) => !i || val > arr[i - 1]);
          if(!isSorted){
            gameResult.isCountdownDisqualified = true
          }
        }
      })
      let qualifiedResults = gameResults.filter((result) => !result.isCountdownDisqualified).map(gameResult=>{
        gameResult.player.username = "✅" + gameResult.player.username 
        return gameResult
      })
      let disqualifiedResults = gameResults.filter((result) => result.isCountdownDisqualified).map(gameResult=>{
        gameResult.player.username = "❌" + gameResult.player.username
        return gameResult
      })
      gameResults = qualifiedResults.concat(disqualifiedResults)

    }



    if(settings.isDartsMode){
      if(settings.isDartsModeBust){
        let results_with_5_guesses_and_not_busted = gameResults.filter(
          (result) => result.guesses.filter(Boolean).length === 5 && result.totalScore <= settings.dartsTargetScore
        )
        let results_with_5_guesses_and_busted = gameResults.filter(
          (result) => result.guesses.filter(Boolean).length === 5 && result.totalScore > settings.dartsTargetScore
        )
        let results_without_5_guesses = gameResults.filter(
          (result) => result.guesses.filter(Boolean).length !== 5
        )
        results_with_5_guesses_and_not_busted.sort((a, b) => this.dartsSort(a,b))
        results_with_5_guesses_and_busted.sort((a, b) => this.dartsSort(a,b))
        results_without_5_guesses.sort((a, b) => this.dartsSort(a,b))
        gameResults = results_with_5_guesses_and_not_busted.concat(results_with_5_guesses_and_busted, results_without_5_guesses)

      }else{
        let results_with_5_guesses = gameResults.filter((result) => result.guesses.filter(Boolean).length === 5)
        let results_without_5_guesses = gameResults.filter((result) => result.guesses.filter(Boolean).length !== 5)
        results_with_5_guesses.sort((a, b) => this.dartsSort(a,b))
        results_without_5_guesses.sort((a, b) => this.dartsSort(a,b))
        gameResults = results_with_5_guesses.concat(results_without_5_guesses)

      }

    }
    const locations = this.#game.getLocations()

    this.#win.webContents.send('show-game-results', locations, gameResults)

    let link: string | undefined

    try {
      link = await makeGameSummaryLink({
        accessToken: this.#session!.access_token,
        bot: this.#session!.user.user_metadata.name,
        streamer: settings.channelName,
        map: this.#game.mapName,
        mode: this.#game.mode,
        locations,
        gameResults
      })
    } catch (err) {
      console.error('could not upload summary', err)
    }
    if(settings.showGameFinished)
      await this.#backend?.sendMessage(
        settings.messageGameFinished.replace('<emoji>', getEmoji(gameResults[0].player.flag)).replace('<username>', gameResults[0].player.username).replace('<link>',link != undefined ? `${link}` : ''),
        { system: true }
      )

    if(this.#game.isGiftingPointsGame && this.#game.gamePointGift > 0  && this.#game.pointGiftCommand !== "")
   
    this.#backend?.sendMessage(
      `${this.#game.pointGiftCommand} ${
        gameResults[0].player.username
      } ${this.#game.gamePointGift}`,
      { system: false }
    )
  }

  init() {
    // Browser Listening
    this.#win.webContents.on('did-navigate-in-page', (_event, url) => {
      if (isGameURL(url)) {
        // TODO(reanna) warn about the thing not being connected
        if (!this.#backend) return

        this.#game
          .start(url, settings.isMultiGuess)
          .then(() => {
            const restoredGuesses = this.#game.isMultiGuess
              ? this.#game.getRoundParticipants()
              : this.#game.getRoundResults()
            this.#win.webContents.send(
              'game-started',
              this.#game.isMultiGuess,
              this.#game.getModeHelp(),
              restoredGuesses,
              this.#game.getLocation()
            )

            if (restoredGuesses.length > 0) {
              this.#backend?.sendMessage(`🌎 Round ${this.#game.round} has resumed`, {
                system: true
              })
            } else if (this.#game.round === 1 ) {
              if(settings.showNewSeedStarted)
                this.#backend?.sendMessage(
                  settings.messageNewSeedStarted.replace('<map>', this.#game.mapName), {
                  system: true
                })
              if(settings.autoShowMode)
                this.#backend?.sendMessage(
                  this.generateModeString(),
                  { system: true }
                )
            } else {
              if (settings.showRoundStarted)
              this.#backend?.sendMessage(`🌎 Round ${this.#game.round} has started`, {
                system: true
              })
            }

            this.openGuesses()
          })
          .catch((err) => {
            console.error(err)
          })
      } else {
        this.#game.outGame()
        this.#win.webContents.send('game-quitted')
      }
    })

    this.#win.webContents.on('did-frame-finish-load', () => {
      if (!this.#game.isInGame) return

      this.#win.webContents.executeJavaScript(`
          window.nextRoundBtn = document.querySelector('[data-qa="close-round-result"]');
          window.playAgainBtn = document.querySelector('[data-qa="play-again-button"]');

          if (window.nextRoundBtn) {
              nextRoundBtn.addEventListener("click", () => {
                  nextRoundBtn.setAttribute('disabled', 'disabled');
                  chatguessrApi.startNextRound(true);
              });
          }

          if (window.playAgainBtn) {
              playAgainBtn.addEventListener("click", () => {
                  playAgainBtn.setAttribute('disabled', 'disabled');
                  chatguessrApi.returnToMapPage();
              });
          }
      `)

      if (this.#game.isFinished) return

      this.#win.webContents.send('refreshed-in-game', this.#game.getLocation())
      // Checks and update seed when the this.game has refreshed
      // update the current location if it was skipped
      // if the streamer has guessed returns scores
      this.#game.refreshSeed().then((roundResults) => {
        if (roundResults && roundResults.location) {
          this.#showRoundResults(roundResults.location, roundResults.roundResults)
        }
      })
    })

    ipcMain.on('next-round-click', () => {
      this.nextRound()
    })

    ipcMain.on('return-to-map-page', () => {
      this.returnToMapPage()
    })

    ipcMain.on('open-guesses', () => {
      this.openGuesses()
    })

    ipcMain.on('close-guesses', () => {
      if (this.#game.guessesOpen) this.closeGuesses()
    })

    ipcMain.handle('get-settings', () => {
      return settings
    })

    ipcMain.on('save-settings', (_event, settings_: Settings) => {
      saveSettings(settings_)
    })

    ipcMain.on('reconnect', () => {
      this.#requestAuthentication()
    })

    ipcMain.handle('get-global-stats', async (_event, sinceTime: StatisticsInterval) => {
      const date = await parseUserDate(sinceTime)
      return this.#db.getGlobalStats(date.timeStamp)
    })

    ipcMain.handle('clear-global-stats', async (_event, sinceTime: StatisticsInterval) => {
      const date = await parseUserDate(sinceTime)
      try {
        await this.#db.deleteGlobalStats(date.timeStamp)
        return true
      } catch (e) {
        console.error(e)
        return false
      }
    })

    ipcMain.handle('get-banned-users', () => {
      return this.#db.getBannedUsers()
    })

    ipcMain.on('add-banned-user', (_event, username: string) => {
      this.#db.addBannedUser(username)
    })

    ipcMain.on('delete-banned-user', (_event, username: string) => {
      this.#db.deleteBannedUser(username)
    })
  }

  getTwitchConnectionState(): TwitchConnectionState {
    if (!this.#backend) {
      return { state: 'disconnected' }
    } else if (this.#backend.isConnected()) {
      return {
        state: 'connected',
        botUsername: this.#backend.botUsername,
        channelName: this.#backend.channelName
      }
    }
    return { state: 'connecting' }
  }

  getSocketConnectionState(): SocketConnectionState {
    if (!this.#socket) {
      return { state: 'disconnected' }
    } else if (this.#socket.connected) {
      return { state: 'connected' }
    }
    return { state: 'connecting' }
  }

  async authenticate(session: Session) {
    this.#session = session
    await this.#initBackend(session)
    await this.#initSocket(session)
  }

  async #initBackend(session: Session) {
    this.#backend?.close()
    this.#backend = undefined
    if (!settings.channelName) {
      return
    }
    if (session.user.app_metadata.provider === 'twitch' && session.provider_token) {
      this.#backend = new TwitchBackend({
        botUsername: session.user.user_metadata.name,
        channelName: settings.channelName,
        whisperToken: session.provider_token
      })
    } else {
      throw new Error('unsupported provider')
    }

    const { avatar } = await getStreamerAvatar(settings.channelName)
    if (avatar) {
      settings.avatar = avatar
      saveSettings(settings)
    }

    const emitConnectionState = () => {
      const state = this.getTwitchConnectionState()
      this.#win.webContents.send('twitch-connection-state', state)
    }

    this.#backend.on('connected', () => {
      emitConnectionState()
      this.#backend?.sendMessage('is now connected', { system: true })
    })
    this.#backend.on('disconnected', (requestedClose) => {
      emitConnectionState()
      if (!requestedClose) {
        // Try to reconnect.
        this.#requestAuthentication()
      }
    })

    this.#backend.on('guess', (userstate: UserData, message: string) => {
      this.#handleGuess(userstate, message).catch((err) => {
        console.error(err)
      })
    })

    this.#backend.on('message', (userstate: UserData, message: string) => {
      this.#handleMessage(userstate, message).catch((err) => {
        console.error(err)
      })
    })

    emitConnectionState()
    try {
      await this.#backend.connect()
    } catch (err) {
      this.#win.webContents.send('twitch-error', err)
      console.error('Backend connection error:', err)
    }
  }

  async #initSocket(session: Session) {
    if (this.#socket?.connected) {
      this.#socket.disconnect()
    }

    const botUsername: string = session.user.user_metadata.name

    this.#socket = io(SOCKET_SERVER_URL, {
      transportOptions: {
        polling: {
          extraHeaders: {
            access_token: session.access_token,
            channelname: settings.channelName,
            bot: botUsername
          }
        }
      }
    })

    this.#socket.on('connect', () => {
      this.#socket?.emit('join', botUsername)
      this.#win.webContents.send('socket-connected')
    })

    this.#socket.on('disconnect', () => {
      this.#win.webContents.send('socket-disconnected')
    })

    this.#socket.on('guess', (userData: UserData, guess: string) => {
      this.#handleGuess(userData, guess).catch((err) => {
        console.error(err)
      })
    })

    await once(this.#socket, 'connect')
  }

  async #handleGuess(userstate: UserData, message: string, isRandomPlonk: boolean = false) {
    if (!message.startsWith('!g') || !this.#game.guessesOpen) return
    // Ignore guesses made by the broadcaster with the CG map: prevents seemingly duplicate guesses
    //if (userstate.username?.toLowerCase() === settings.channelName.toLowerCase()) return
    // Check if user is banned
    if (this.isUserBanned(userstate.username!)) return

    const location = parseCoordinates(message.replace(/^!g\s+/, ''))
    if (!location) return

    try {
      const guess = await this.#game.handleUserGuess(userstate, location, isRandomPlonk)

      if (!this.#game.isMultiGuess) {
        this.#win.webContents.send('render-guess', guess)
        if (settings.showHasGuessed) {
          await this.#backend?.sendMessage(
            settings.messageHasGuessed.replace('<emoji>', getEmoji(guess.player.flag)).replace('<username>', guess.player.username)
          )
        }
      } else {
        this.#win.webContents.send('render-multiguess', guess)

        if (!guess.modified) {
          if (settings.showHasGuessed) {
            await this.#backend?.sendMessage(
              settings.messageHasGuessed.replace('<emoji>', getEmoji(guess.player.flag)).replace('<username>', guess.player.username)
            )
          }
        } else {
          if (settings.showGuessChanged) {
            await this.#backend?.sendMessage(
              settings.messageGuessChanged.replace('<emoji>', getEmoji(guess.player.flag)).replace('<username>', guess.player.username)
            )
          }
        }
      }
    } catch (err: any) {
      if (err.code === 'alreadyGuessed') {
        if (settings.showHasAlreadyGuessed) {
          await this.#backend?.sendMessage(
            settings.messageHasAlreadyGuessed.replace('<username>', userstate['display-name'])
          )
        }
      } else if (err.code === 'submittedPreviousGuess') {
        if (settings.showSubmittedPreviousGuess) {
          await this.#backend?.sendMessage(
            settings.messageSubmittedPreviousGuess.replace('<username>', userstate['display-name'])
          )
        }
      } else {
        console.error(err)
      }
    }
    if (userstate.username?.toLowerCase() === settings.channelName.toLowerCase()){
      this.#game.getRoundResults()
  
      return;
    }
  }
  generateModeString(): string{
    let returnString = ``
    if (settings.isClosestInWrongCountryModeActivated) 
      returnString += `wrongCountryOnly: on | `
    if (settings.waterPlonkMode === "mandatory")
      returnString += `oceanPlonk: mandatory | `
    if (settings.waterPlonkMode === "illegal")
      returnString += `oceanPlonk: illegal | `
    if (settings.invertScoring)
      returnString += `invertScoring: on | `
    if (settings.isGameOfChickenModeActivated){
      returnString += `gameOfChicken: on | `
      if (settings.chickenMode5kGivesPoints){
        returnString += `Chicken can 5k: on | `
      }
      if (settings.chickenModeSurvivesWith5k){
        returnString += `5k avoids chicken: on | `
      }
    }
    
    if (settings.countdownMode !== "normal"){
      if(settings.countdownMode === "countdown")
        returnString += `Countdown | `
      if(settings.countdownMode === "countup")
        returnString += `Countup | `
    }
      
    if (settings.isDartsMode)
      returnString += `dartsMode: ${settings.dartsTargetScore} ${settings.isDartsModeBust?"bust":""} | `
    if (returnString === "")
      returnString = "No special modes activated"
    return returnString[returnString.length-2] === "|" ? returnString.slice(0, -2) : returnString
  }

  #cgCooldown: boolean = false
  #mapCooldown: boolean = false
  async #handleMessage(userstate: UserData, message: string) {
    if (!message.startsWith('!')) return
    if (!userstate['user-id'] || !userstate['display-name']) return

    const userId = userstate.badges?.broadcaster === '1' ? 'BROADCASTER' : userstate['user-id']
    message = message.trim().toLowerCase()

    if (message === settings.cgCmd) {
      if (this.#cgCooldown && userId !== 'BROADCASTER') return

      await this.#backend?.sendMessage(
        settings.cgMsg.replace('<your cg link>', `chatguessr.com/map/${this.#backend?.botUsername}`)
      )

      this.#cgCooldown = true
      setTimeout(() => {
        this.#cgCooldown = false
      }, settings.cgCmdCooldown * 1000)
      return
    }

    if (message.startsWith('!flag ')) {
      const countryReq = message.slice(message.indexOf(' ') + 1).trim()
      const dbUser = this.#db.getOrCreateUser(
        userId,
        userstate['display-name'],
        userstate.avatar,
        userstate.color
      )
      if (!dbUser) return

      let newFlag: string | null | undefined
      if (countryReq === 'none') {
        newFlag = null
        await this.#backend?.sendMessage(`${dbUser.username} flag removed`)
      } else if (countryReq === 'random') {
        newFlag = randomCountryFlag()
        await this.#backend?.sendMessage(`${dbUser.username} got ${getEmoji(newFlag)}`)
      } else {
        newFlag = selectFlag(countryReq)
        if (!newFlag) {
          await this.#backend?.sendMessage(`${dbUser.username} no flag found`)
          return
        }
      }
      this.#db.setUserFlag(dbUser.id, newFlag)
      return
    }

    if (message === settings.flagsCmd) {
      await this.#backend?.sendMessage('Available flags: chatguessr.com/flags')
      return
    }

    // check if first word of message equals to settings.lastlocCmd
    if (message.split(' ')[0] === settings.lastlocCmd) {
      // check if second word is an integer
      const secondWord = message.split(' ')[1]
      let locationNumber = 1
      //check if second word is an int
      if (secondWord && !isNaN(parseInt(secondWord))) {
        locationNumber = parseInt(secondWord)
      }
      locationNumber = locationNumber - 1

      const last5Locations = this.#db.getLastlocs()
      if (!last5Locations.length) {
        await this.#backend?.sendMessage('No locations saved yet.')
        return
      }
      if (locationNumber < 0) {
        await this.#backend?.sendMessage('Location number out of range. Must be 1 or more.')
        return
      }
      if (locationNumber >= last5Locations.length) {
        await this.#backend?.sendMessage('Location number out of range. Must be 5 or less.')
        return
      }

      const lastLocation = last5Locations[locationNumber]

      let returnNumber = ''
      if (locationNumber === 0) returnNumber = 'The last location'
      else if (locationNumber === 1) returnNumber = 'The 2nd to last location'
      else if (locationNumber === 2) returnNumber = 'The 3rd to last location'
      else returnNumber = `The ${locationNumber + 1}th to last location`

      const url = await makeMapsUrl(lastLocation.location)
      await this.#backend?.sendMessage(
        `${returnNumber} was on the map "${lastLocation.map_name}": ${url}`
      )
      return
    }
    
    if(message === settings.modeCmd){
      if (!this.#game.isInGame || !this.#game.seed || !this.#game.seed.map) {
        return
      }
      
      await this.#backend?.sendMessage(
        this.generateModeString()
      )
    }

    if (message === settings.mapCmd) {
      // We'll only have a map ID if we're
      if (!this.#game.isInGame || !this.#game.seed || !this.#game.seed.map) {
        return
      }
      // Allow the broadcaster to circumvent the cooldown
      if (this.#mapCooldown && userId !== 'BROADCASTER') return
      this.#mapCooldown = true

      const map = await fetchMap(this.#game.seed.map)
      if (map) {
        await this.#backend?.sendMessage(
          `🌎 Now playing '${map.name}' ${map.creator? `by ${map.creator.nick},`:""} played ${map.numFinishedGames} times with ${map.likes} likes${map.description ? `: ${map.description}` : ''}`
        )
      }

      setTimeout(() => {
        this.#mapCooldown = false
      }, settings.mapCmdCooldown * 1000)
      return
    }

    if (message.split(' ')[0] === settings.getUserStatsCmd) {
      const date = message.split(' ')[1]
      const dateInfo = await parseUserDate(date)
      if (dateInfo.timeStamp < 0) {
        await this.#backend?.sendMessage(`${userstate['display-name']}: ${dateInfo.description}.`)
        return
      }
      const hasGuessedOnOngoingRound = this.#db.userGuessedOnOngoingRound(userId)
      if (hasGuessedOnOngoingRound) {
        await this.#backend?.sendMessage(
          `${userstate['display-name']}: ${settings.getUserStatsCmd} cannot be used after guessing during an ongoing round.`
        )
        return
      }
      const userInfo = this.#db.getUserStats(userId, dateInfo.timeStamp)
      if (!userInfo) {
        if (dateInfo.timeStamp === 0) {
          await this.#backend?.sendMessage(`${userstate['display-name']} you've never guessed yet.`)
        } else {
          await this.#backend?.sendMessage(
            `${userstate['display-name']} no guesses for this time period.`
          )
        }
      } else {
        let msg = `${getEmoji(userInfo.flag)} ${userInfo.username}: `
        if (dateInfo.description) {
          msg += `Stats for ${dateInfo.description}: `
        }
        msg += `
					Current streak: ${userInfo.streak}.
					Best streak: ${userInfo.bestStreak}.
					Correct countries: ${userInfo.correctGuesses}/${userInfo.nbGuesses}${
            userInfo.nbGuesses > 0
              ? ` (${((userInfo.correctGuesses / userInfo.nbGuesses) * 100).toFixed(2)}%).`
              : '.'
          }
					Avg. score: ${Math.round(userInfo.meanScore)}.
					Victories: ${userInfo.victories}.
					5ks: ${userInfo.perfects}.
          ${!userInfo.bestRandomPlonk ? '' : `Best Random Plonk: ${userInfo.bestRandomPlonk}.`}
				`
        await this.#backend?.sendMessage(msg)
      }
      return
    }

    if (message.split(' ')[0] === settings.getBestStatsCmd) {
      const date = message.split(' ')[1]
      const dateInfo = await parseUserDate(date)
      if (dateInfo.timeStamp < 0) {
        await this.#backend?.sendMessage(`${userstate['display-name']}: ${dateInfo.description}.`)
        return
      }
      const { streak, victories, perfects, bestRandomPlonk } = this.#db.getBestStats(dateInfo.timeStamp, !settings.includeBroadcasterDataInBest)
      if (!streak && !victories && !perfects && !bestRandomPlonk) {
        await this.#backend?.sendMessage('No stats available.')
      } else {
        let msg = ''
        if (streak) {
          msg += `Streak: ${streak.streak} (${streak.username}). `
        }
        if (victories) {
          msg += `Victories: ${victories.victories} (${victories.username}). `
        }
        if (perfects) {
          msg += `5ks: ${perfects.perfects} (${perfects.username}). `
        }
        if (bestRandomPlonk) {
          let distance = bestRandomPlonk.distance
          let unit = 'km'
          let distanceNumber = "0"
          if (distance < 1) {
            distanceNumber = (distance * 1000).toFixed(2)
            unit = 'm'
          }
          else {
            distanceNumber = distance.toFixed(2)
          }
          msg += `Best Random Plonk: ${bestRandomPlonk.bestRandomPlonk} (${distanceNumber} ${unit}) by ${bestRandomPlonk.username}. `
        }
        if (!dateInfo.description) {
          await this.#backend?.sendMessage(`Channels best: ${msg}`)
        } else {
          await this.#backend?.sendMessage(`Best ${dateInfo.description}: ${msg}`)
        }
      }
      return
    }

    
    

    if (message === settings.clearUserStatsCmd) {
      const dbUser = this.#db.getUser(userId)
      if (dbUser) {
        this.#db.resetUserStats(dbUser.id)
        await this.#backend?.sendMessage(
          `${getEmoji(dbUser.flag)} ${dbUser.username} 🗑️ stats cleared !`
        )
      } else {
        await this.#backend?.sendMessage(`${userstate['display-name']} you've never guessed yet.`)
      }
      return
    }
    // if first chars of message are equal to settings of randomplonkcmd check if it is randomplonkcmd
    if(message.startsWith(settings.randomPlonkCmd)){
      if (!this.#game.isInGame) return

      var { lat, lng } = await getRandomCoordsInLand(this.#game.seed!.bounds);
      if (this.#game.waterPlonkMode === "mandatory") {
        const newCoords = await getRandomCoordsNotInLand(this.#game.seed!.bounds);
        lat = newCoords.lat;
        lng = newCoords.lng;
      }
      
      const randomGuess = `!g ${lat}, ${lng}`
      this.#handleGuess(userstate, randomGuess, true).catch((err) => {
        console.error(err)
      })
      return
    }
    
    if (message.startsWith(settings.randomPlonkWaterCmd) || message.startsWith("!taquitoplonk")) {
      if (!this.#game.isInGame) return

      var { lat, lng } = await getRandomCoordsNotInLand(this.#game.seed!.bounds);
      if (this.#game.waterPlonkMode === "illegal" && message !== "!taquitoplonk") {
        const newCoords = await getRandomCoordsInLand(this.#game.seed!.bounds);
        lat = newCoords.lat;
        lng = newCoords.lng;
      }
      
      const randomGuess = `!g ${lat}, ${lng}`
      this.#handleGuess(userstate, randomGuess, true).catch((err) => {
        console.error(err)
      })
      return
    }

    // streamer commands
    if (process.env.NODE_ENV !== 'development' || userstate.badges?.broadcaster !== '1') return

    if (message.startsWith('!spamguess')) {
      const max = parseInt(message.split(' ')[1] ?? '50', 10)

      let i = 0
      const interval = setInterval(async () => {
        const userId = `123450${i}`
        // const flag = randomCountryFlag()
        // this.#db.setUserFlag(userId, flag)
        const { lat, lng } = await getRandomCoordsInLand(this.#game.seed!.bounds)
        await this.#handleGuess(
          {
            'user-id': userId,
            username: `fake_${i}`,
            'display-name': `fake_${i}`,
            color: `#${Math.random().toString(16).slice(2, 8).padStart(6, '0')}`
          },
          `!g ${lat},${lng}`
        )
        i++
        if (i === max) {
          clearInterval(interval)
        }
      }, 200)
    }
  }

  isUserBanned(username: string) {
    const bannedUsers = this.#db.getBannedUsers()
    const isBanned = bannedUsers.some((user) => user.username === username)
    return isBanned
  }
}
