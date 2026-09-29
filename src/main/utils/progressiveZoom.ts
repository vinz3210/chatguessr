export function progressiveZoomScore(score: number, guessedAt: number, startedAt: number, durationMs: number, affectedPoints: number) {
  if (score <= 0 || durationMs <= 0) return score
  const elapsed = Math.max(0, Math.min(guessedAt - startedAt, durationMs))
  const affectedFraction = (Number.isFinite(affectedPoints) ? Math.max(0, Math.min(affectedPoints, 5000)) : 5000) / 5000
  return Math.round(score * (1 - affectedFraction * elapsed / durationMs))
}
