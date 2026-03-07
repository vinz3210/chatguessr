import SQLite from 'better-sqlite3'
import { randomUUID } from 'crypto'

export interface HideAndSeekLocation {
  lat: number
  lng: number
  heading: number
  pitch: number
  zoom: number
  pano: string
  tags: string[]
}

export class HideSeekDatabase {
  #db: SQLite.Database

  constructor(file: string) {
    this.#db = new SQLite(file)
    this.#init()
  }

  #init() {
    this.#db.prepare(`
      CREATE TABLE IF NOT EXISTS hideseek_locations (
        id TEXT PRIMARY KEY NOT NULL,
        user TEXT NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        heading REAL NOT NULL,
        pitch REAL NOT NULL,
        zoom REAL NOT NULL,
        pano TEXT NOT NULL,
        tags TEXT NOT NULL, -- JSON array
        used INTEGER DEFAULT 0, -- 0 for false, 1 for true
        created_at INTEGER NOT NULL
      )
    `).run()
  }

  saveLocation(user: string, location: HideAndSeekLocation): string {
    const id = randomUUID()
    const stmt = this.#db.prepare(`
      INSERT INTO hideseek_locations (id, user, lat, lng, heading, pitch, zoom, pano, tags, created_at)
      VALUES (:id, :user, :lat, :lng, :heading, :pitch, :zoom, :pano, :tags, :createdAt)
    `)

    stmt.run({
      id,
      user,
      lat: location.lat,
      lng: location.lng,
      heading: location.heading,
      pitch: location.pitch,
      zoom: location.zoom,
      pano: location.pano,
      tags: JSON.stringify(location.tags),
      createdAt: Math.floor(Date.now() / 1000)
    })

    return id
  }

  markLocationUsed(id: string) {
    const stmt = this.#db.prepare(`
      UPDATE hideseek_locations SET used = 1 WHERE id = ?
    `)
    stmt.run(id)
  }

  getUnusedLocations(): { id: string; user: string; location: HideAndSeekLocation }[] {
    const stmt = this.#db.prepare(`
      SELECT id, user, lat, lng, heading, pitch, zoom, pano, tags FROM hideseek_locations WHERE used = 0
    `)
    const rows = stmt.all() as any[]
    return rows.map(row => ({
      id: row.id,
      user: row.user,
      location: {
        lat: row.lat,
        lng: row.lng,
        heading: row.heading,
        pitch: row.pitch,
        zoom: row.zoom,
        pano: row.pano,
        tags: JSON.parse(row.tags)
      }
    }))
  }
}

export const hideseekDatabase = (file: string) => new HideSeekDatabase(file)
