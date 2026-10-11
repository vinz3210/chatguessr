function ready(button: HTMLButtonElement) {
  return !button.disabled && button.getClientRects().length > 0
}

export function advanceAutoCgRound() {
  const button = document.querySelector<HTMLButtonElement>('[data-qa="close-round-result"]')
  if (!button || !ready(button)) return false
  button.click()
  return true
}

/** Current play-bar structure, with the legacy data-qa selector as a fallback. */
export function startAutoCgMap(nmpz?: boolean) {
  if (nmpz) {
    const tab = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (button) => button.textContent?.trim().toUpperCase() === 'NMPZ' && ready(button)
    )
    if (!tab || !ready(tab)) return false
    if (tab.getAttribute('aria-selected') !== 'true') {
      tab.click()
      return false
    }
  }
  const candidates = document.querySelectorAll<HTMLButtonElement>(
    '[data-qa="start-game-button"], [class*="play-bar_"] button[class*="button_variantPrimary__"], [class*="start-standard-game_"] button[class*="button_variantPrimary__"]'
  )
  const button = [...candidates].find(ready)
  if (!button) return false
  // GeoGuessr also renders function-lock wrappers for signed-in accounts.
  // Let its enabled Play control handle account checks instead of inferring them from CSS.
  button.click()
  return true
}
