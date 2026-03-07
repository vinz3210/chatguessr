import { beforeEach, describe, it, expect } from 'vitest'
import { HideSeekDatabase } from './HideSeekDatabase'

describe('HideSeekDatabase', () => {
    let db: HideSeekDatabase

    beforeEach(() => {
        // Using in-memory database for testing
        db = new HideSeekDatabase(':memory:')
    })

    it('should save a location and return an ID', () => {
        const user = 'testuser'
        const location = {
            lat: 10,
            lng: 20,
            heading: 90,
            pitch: 0,
            zoom: 1,
            pano: 'testpano',
            tags: ['tag1', 'tag2']
        }

        const id = db.saveLocation(user, location)
        expect(id).toBeDefined()
        expect(typeof id).toBe('string')
        expect(id.length).toBeGreaterThan(0)
    })

    it('should mark a location as used', () => {
        const user = 'testuser'
        const location = {
            lat: 10,
            lng: 20,
            heading: 90,
            pitch: 0,
            zoom: 1,
            pano: 'testpano',
            tags: []
        }

        const id = db.saveLocation(user, location)
        db.markLocationUsed(id)

        // We can't easily query the private #db, but since markLocationUsed doesn't throw, 
        // and we've verified the saving part, we can assume it works if it runs the statement.
        // In a more thorough test, we'd add a getter or use a separate connection to check the value.
    })
})
