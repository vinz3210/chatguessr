import { describe, it, expect } from 'vitest'
import { speakableText } from './pocketText'

describe('speakableText', () => {
  it('spells out degrees', () => {
    expect(speakableText('Facing 47° to the east.')).toBe('Facing 47 degrees to the east.')
    expect(speakableText('It is 31°C out.')).toBe('It is 31 degrees C out.')
  })

  it('turns other scripts into a pause', () => {
    expect(speakableText('A sign reads "Москва 12".')).toBe('A sign reads "... 12".')
    expect(speakableText('Text: Улица Ленина and ถนนสุขุมวิท here')).toBe('Text: ... and ... here')
    expect(speakableText('A sign reads 東京 or القاهرة.')).toBe('A sign reads ... or ...')
  })

  it('leaves accented Latin text alone', () => {
    expect(speakableText('A sign reads "São Paulo, Łódź, Ærøskøbing".')).toBe(
      'A sign reads "São Paulo, Łódź, Ærøskøbing".'
    )
  })

  it('straightens quotes the model does not know', () => {
    expect(speakableText('It says «Rue» and „Straße“.')).toBe('It says "Rue" and "Straße".')
  })
})
