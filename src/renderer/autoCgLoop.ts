type State = 'none' | 'in-round' | 'round-results' | 'game-results'

/** One cancellable action per game state; DOM readiness is retried for at most 30 seconds. */
export class AutoCgLoop {
  private timer: ReturnType<typeof setTimeout> | undefined
  private revision = 0
  private state: State = 'none'
  private expired = false
  private paused = false
  private abortController = new AbortController()

  constructor(
    private options: {
      enabled: () => boolean
      resultsMs: () => number
      plonk: (signal: AbortSignal) => Promise<boolean>
      advance: () => boolean
      replay: (signal: AbortSignal) => Promise<boolean>
      status: (message: string) => void
    }
  ) {}

  transition(state: State, force = false) {
    if (!force && state === this.state) return
    this.cancel()
    this.state = state
    this.expired = false
    if (!this.options.enabled() || this.paused) return
    if (state === 'round-results') this.schedule('Advancing round…', this.options.advance)
    if (state === 'game-results') this.schedule('Starting next game…', this.options.replay)
  }

  expireRound() {
    if (!this.options.enabled() || this.paused || this.state !== 'in-round' || this.expired) return
    this.expired = true
    this.schedule('Plonking for the streamer…', this.options.plonk, 0)
  }

  setPaused(paused: boolean) {
    this.paused = paused
    this.transition(this.state, true)
  }

  cancel() {
    this.abortController.abort()
    this.abortController = new AbortController()
    this.revision++
    clearTimeout(this.timer)
    this.timer = undefined
  }

  private schedule(
    message: string,
    action: (signal: AbortSignal) => boolean | Promise<boolean>,
    delay?: number
  ) {
    const revision = this.revision
    const signal = this.abortController.signal
    const wait = delay ?? Math.max(3000, this.options.resultsMs())
    const deadline = Date.now() + wait + 30000
    const attempt = async () => {
      if (revision !== this.revision || !this.options.enabled() || this.paused) return
      this.options.status(message)
      try {
        if (await action(signal)) return
      } catch (error) {
        if (revision !== this.revision) return
        this.options.status(
          `AutoCG paused: ${error instanceof Error ? error.message : String(error)}`
        )
        this.paused = true
        this.cancel()
        return
      }
      if (revision !== this.revision) return
      if (Date.now() >= deadline) {
        this.options.status('AutoCG paused: game controls did not become ready. Resume to retry.')
        this.paused = true
        this.cancel()
        return
      }
      this.timer = setTimeout(attempt, 250)
    }
    this.timer = setTimeout(attempt, wait)
  }
}
