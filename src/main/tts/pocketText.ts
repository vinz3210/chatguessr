// Letters of any script but Latin, with their combining marks. Pocket TTS only knows Latin script
// and turns anything else into noise.
const NON_LATIN_RUN = /(?:[^\P{L}\p{Script=Latin}]\p{M}*)+/gu

/** Rewrites what the local Pocket TTS model can't pronounce. */
export function speakableText(text: string): string {
  return text
    .replace(/°\s*([CF])\b/g, ' degrees $1')
    .replace(/°/g, ' degrees')
    .replace(/[«»„“”]/g, '"')
    .replace(NON_LATIN_RUN, '...')
    .replace(/\.\.\.(?:\s*\.\.\.)+/g, '...')
    .replace(/\.{4,}/g, '...')
    .replace(/[ \t]+/g, ' ')
    .trim()
}
