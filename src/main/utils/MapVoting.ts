export type AutoCgMap = { name: string; URL: string; weight: number; NMPZ?: boolean }
type Candidate = AutoCgMap & { emote: string }
const emotes = ['Kappa', 'PogChamp', 'CoolCat']

const fallbackMaps: AutoCgMap[] = [
  { name: 'A Community World', URL: '62a44b22040f04bd36e8a914', weight: 100, NMPZ: true },
  { name: 'A Chatguessr World', URL: '659feab6c661e2774c442516', weight: 50 },
  { name: 'A Rural Chatguessr World', URL: '662ba4ccc707d4140e8139e2', weight: 20 },
  { name: 'An Urban Chatguessr World', URL: '662e8567981ce4c287038347', weight: 20 }
]

export function parseAutoCgMaps(value: unknown): AutoCgMap[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  return value.filter((entry): entry is AutoCgMap => {
    if (!entry || typeof entry !== 'object') return false
    const map = entry as Partial<AutoCgMap>
    if (typeof map.name !== 'string' || typeof map.URL !== 'string') return false
    if (!/^[a-f\d]{24}$/.test(map.URL) || ids.has(map.URL)) return false
    if (typeof map.weight !== 'number' || !Number.isFinite(map.weight) || map.weight <= 0)
      return false
    ids.add(map.URL)
    return true
  })
}

export function sampleAutoCgMaps(maps: AutoCgMap[], random = Math.random): Candidate[] {
  const pool = parseAutoCgMaps(maps).map((map) => ({ ...map }))
  const sample: Candidate[] = []
  while (pool.length && sample.length < emotes.length) {
    let target = random() * pool.reduce((total, map) => total + map.weight, 0)
    let index = pool.findIndex((map) => (target -= map.weight) < 0)
    if (index < 0) index = pool.length - 1
    sample.push({ ...pool.splice(index, 1)[0], emote: emotes[sample.length] })
  }
  return sample
}

export default class MapVoting {
  private candidates: Candidate[] = []
  private votes = new Map<string, string>()
  private timeout: ReturnType<typeof setTimeout> | undefined
  private revision = 0
  private active = false
  private nextMap: Candidate | undefined
  private finishing: Promise<void> | undefined

  constructor(private announce: (message: string) => Promise<unknown>) {}

  cancel() {
    this.revision++
    clearTimeout(this.timeout)
    this.active = false
    this.candidates = []
    this.votes.clear()
    this.nextMap = undefined
    this.finishing = undefined
  }

  async start() {
    this.cancel()
    const revision = this.revision
    let maps = fallbackMaps
    try {
      const response = await fetch('https://vinz3210.gg/automaplist.json', {
        signal: AbortSignal.timeout(5000)
      })
      if (response.ok) {
        const parsed = parseAutoCgMaps(await response.json())
        if (parsed.length) maps = parsed
      }
    } catch {
      // Offline mode uses the bundled pool from the original automation branch.
    }
    if (revision !== this.revision) return
    this.candidates = sampleAutoCgMaps(maps)
    this.active = true
    this.timeout = setTimeout(() => void this.finish().catch(console.error), 150000)
    await this.announce(
      'Vote for the next map! Send an emote or !vote 1/2/3. Voting lasts 2.5 minutes, or until the game ends.'
    )
    for (const [index, map] of this.candidates.entries()) {
      if (revision !== this.revision) return
      await this.announce(`${map.emote} / !vote ${index + 1}: ${map.name}`)
    }
  }

  vote(userId: string, message: string) {
    if (!this.active || !userId) return
    const candidate = this.candidates.find(
      (map, index) => map.emote === message.trim() || message.trim() === `!vote ${index + 1}`
    )
    if (candidate) this.votes.set(userId, candidate.URL)
  }

  finish(): Promise<void> {
    if (this.finishing) return this.finishing
    if (!this.active) return Promise.resolve()
    this.active = false
    clearTimeout(this.timeout)
    const counts = this.candidates.map(
      (map) => [...this.votes.values()].filter((id) => id === map.URL).length
    )
    const highest = Math.max(...counts)
    const winners = this.candidates.filter((_, index) => counts[index] === highest)
    this.nextMap = winners[Math.floor(Math.random() * winners.length)]
    this.finishing = this.nextMap
      ? Promise.resolve(this.announce(`The next map is ${this.nextMap.name}!`)).then(() => {})
      : Promise.resolve()
    return this.finishing
  }

  async takeNextMap(): Promise<{ id: string; nmpz?: boolean } | null> {
    await this.finish()
    const nextMap = this.nextMap
    this.cancel()
    return nextMap ? { id: nextMap.URL, nmpz: nextMap.NMPZ === true } : null
  }
}
