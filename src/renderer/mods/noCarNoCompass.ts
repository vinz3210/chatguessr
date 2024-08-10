// Adapted from : https://openuserjs.org/scripts/drparse/GeoNoCar
// @ts-nocheck
import { getLocalStorage, setLocalStorage } from '../useLocalStorage'
;(function noCarNoCompass() {
  const settings = getLocalStorage('cg_ncnc__settings', {
    noCar: false,
    noCompass: false
  })

  const compassRemover = document.createElement('style')
  const REMOVE_COMPASS_CSS = '[data-qa="compass"], [class^="panorama-compass_"] { display: none; }'
  compassRemover.textContent = REMOVE_COMPASS_CSS

  if (settings.noCompass) {
    document.head.append(compassRemover)
  }

  window.toggleNoCarMode = (el) => {
    settings.noCar = el.checked
    setLocalStorage('cg_ncnc__settings', settings)
    if (window.ppController) {
      window.pp.hideCar = settings.noCar
      window.ppController.updateState(window.pp)
    }
  }

  window.toggleNoCompassMode = (el) => {
    settings.noCompass = el.checked
    setLocalStorage('cg_ncnc__settings', settings)
    if (el.checked) {
      document.head.append(compassRemover)
    } else {
      compassRemover.remove()
    }
  }

  const classicGameGuiHTML = `
    <div class="section_sizeMedium__CuXRP">
      <div class="bars_root__tryg2 bars_center__kXp6T">
        <div class="bars_before__S32L5"></div>
        <span class="bars_content__Nw_TD"><h3>NCNC settings</h3></span>
        <div class="bars_after__50_BW"></div>
      </div>
    </div>
    <div class="start-standard-game_settings__x94PU">
      <div style="display: flex; justify-content: space-between">
        <div style="display: flex; align-items: center">
          <span class="game-options_optionLabel__Vk5xN" style="margin: 0; padding-right: 6px;">No car</span>
          <input type="checkbox" id="enableNoCar" onclick="toggleNoCarMode(this)" class="toggle_toggle__qfXpL">
        </div>
        <div style="display: flex; align-items: center;">
          <span class="game-options_optionLabel__Vk5xN" style="margin: 0; padding-right: 6px;">No compass</span>
          <input type="checkbox" id="enableNoCompass" onclick="toggleNoCompassMode(this)" class="toggle_toggle__qfXpL">
        </div>
      </div>
    </div>
  `

  const checkInsertGui = () => {
    if (
      document.querySelector('[class^="radio-box_root__"]') &&
      document.querySelector('#enableNoCar') === null
    ) {
      document
        .querySelector('[class^="section_sectionMedium__"]')
        ?.insertAdjacentHTML('beforeend', classicGameGuiHTML)

      if (settings.noCar) {
        ;(document.querySelector('#enableNoCar') as HTMLInputElement).checked = true
      }

      if (settings.noCompass) {
        ;(document.querySelector('#enableNoCompass') as HTMLInputElement).checked = true
      }
    }
  }

  const observer = new MutationObserver(() => {
    checkInsertGui()
  })

  observer.observe(document.body, {
    subtree: true,
    childList: true
  })
})()
