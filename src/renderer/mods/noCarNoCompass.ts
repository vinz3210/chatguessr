// Adapted from : https://openuserjs.org/scripts/drparse/GeoNoCar
// @ts-nocheck
import { getLocalStorage, setLocalStorage } from '../useLocalStorage'
;(function noCarNoCompass() {
  const settings = getLocalStorage('cg_ncnc__settings', {
    noCar: false,
    noCompass: false,
    water: false,
    scramble: false,
    rescramble: false,
    rescrambleTime: 1000,
    pixelate: false,
    pixelScale: 120,
    greyscale: false,
    upsidedown: false,
    sepia: false,
    toon: false,
    toonScale:7,
    crt: false,
    min: false
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
  window.toggleScrambleMode = (el) => {
    settings.scramble = el.checked
    setLocalStorage('cg_ncnc__settings', settings)
    updateGui()
    if (window.ppController) {
      window.pp.scramble = settings.scramble
      window.ppController.updateState(window.pp)
    }
  }
  window.toggleRescrambleMode = (el) => {
    settings.rescramble = el.checked
    setLocalStorage('cg_ncnc__settings', settings)
    if (window.ppController) {
      window.pp.rescramble = settings.rescramble
      window.ppController.updateState(window.pp)
    }
  }
  window.setRescrambleTime = (value) => {
    settings.rescrambleTime = value
    setLocalStorage('cg_ncnc__settings', settings)
    if (window.ppController) {
      window.pp.rescrambleTime = settings.rescrambleTime
      window.ppController.updateState(window.pp)
    }
  }

  window.togglePixelateMode = (el) => {
    settings.pixelate = el.checked
    setLocalStorage('cg_ncnc__settings', settings)
    if (window.ppController) {
      window.pp.pixelate = settings.pixelate
      window.pp.pixelScale = 120
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
  window.toggleUpsidedown = (el) => {
    settings.upsidedown = el.checked
    setLocalStorage('cg_ncnc__settings', settings)
    if (el.checked) {
      document.body.style.transform = 'rotate(180deg)'
      document.body.style.transformOrigin = 'center center'
    } else {
      document.body.style.transform = 'none'
    }
  }

  window.toggleGreyscale = (el) => {
    settings.greyscale = el.checked
    // if greyscale is enabled, remove sepia
    if (settings.sepia) {
      settings.sepia = false
      document.getElementById('enableSepia').checked = false
    }
    setLocalStorage('cg_ncnc__settings', settings)
    if (el.checked) {
      document.body.style.filter = 'grayscale(100%)'
    } else {
      document.body.style.filter = 'none'
    }
  }
  window.toggleSepia = (el) => {
    settings.sepia = el.checked
    // if sepia is enabled, remove greyscale
    if (settings.greyscale) {
      settings.greyscale = false
      document.getElementById('enableGreyscale').checked = false
    }
    setLocalStorage('cg_ncnc__settings', settings)
    if (el.checked) {
      document.body.style.filter = 'sepia(90%)'
    } else {
      document.body.style.filter = 'none'
    }
  }
  window.toggleWaterMode = (el) => {
    settings.water = el.checked
    setLocalStorage('cg_ncnc__settings', settings)
    if (window.ppController) {
      window.pp.water = settings.water
      window.ppController.updateState(window.pp)
    }
  }
  window.toggleMinMode = (el) => {
    settings.min = el.checked
    setLocalStorage('cg_ncnc__settings', settings)
    if (window.ppController) {
      window.pp.min = settings.min
      window.ppController.updateState(window.pp)
    }
  }
  window.toggleCrtMode = (el) => {
    settings.crt = el.checked
    setLocalStorage('cg_ncnc__settings', settings)
    if (window.ppController) {
      window.pp.crt = settings.crt
      window.ppController.updateState(window.pp)
    }
  }
  window.toggleToonMode = (el) => {
    settings.toon = el.checked
    setLocalStorage('cg_ncnc__settings', settings)
    if (window.ppController) {
      window.pp.toon = settings.toon
      window.pp.toonScale = 7
      window.ppController.updateState(window.pp)
    }
  }
  let classicGameGuiHTML = getClassicGameGuiHTML(settings);

  function getClassicGameGuiHTML(settings: any) {
    return `
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
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel__Vk5xN" style="margin: 0; padding-right: 6px;">Water Filter</span>
        <input type="checkbox" id="enableWaterMode" onclick="toggleWaterMode(this)" class="toggle_toggle__qfXpL">
        </div>
      </div>
      <div style="display: flex; justify-content: space-between">
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel__Vk5xN" style="margin: 0; padding-right: 6px;">Greyscale</span>
        <input type="checkbox" id="enableGreyscale" onclick="toggleGreyscale(this)" class="toggle_toggle__qfXpL">
        </div>
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel__Vk5xN" style="margin: 0; padding-right: 6px;">Sepia</span>
        <input type="checkbox" id="enableSepia" onclick="toggleSepia(this)" class="toggle_toggle__qfXpL">
        </div>
        
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel__Vk5xN" style="margin: 0; padding-right: 6px;">Upsidedown</span>
        <input type="checkbox" id="enableUpsidedown" onclick="toggleUpsidedown(this)" class="toggle_toggle__qfXpL">
        </div>
      </div>
      <div style="display: flex; justify-content: space-between">
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel__Vk5xN" style="margin: 0; padding-right: 6px;">Crt</span>
        <input type="checkbox" id="enableCrtMode" onclick="toggleCrtMode(this)" class="toggle_toggle__qfXpL">
        </div>
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel__Vk5xN" style="margin: 0; padding-right: 6px;">Min</span>
        <input type="checkbox" id="enableMinMode" onclick="toggleMinMode(this)" class="toggle_toggle__qfXpL">
        </div>
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel__Vk5xN" style="margin: 0; padding-right: 6px;">Toon</span>
        <input type="checkbox" id="enableToonMode" onclick="toggleToonMode(this)" class="toggle_toggle__qfXpL">
        </div>
      </div>
      <div style="display: flex; justify-content: space-between">
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel__Vk5xN" style="margin: 0; padding-right: 6px;">Scramble</span>
        <input type="checkbox" id="enableScrambleMode" onclick="toggleScrambleMode(this)" class="toggle_toggle__qfXpL">
        </div>
        
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel__Vk5xN" style="margin: 0; padding-right: 6px;">Pixelate</span>
        <input type="checkbox" id="enablePixelateMode" onclick="togglePixelateMode(this)" class="toggle_toggle__qfXpL">
        </div>
      </div>

      ${
        settings.scramble
        ? `<div style="display: flex; justify-content: space-between">
          <div style="display: flex; align-items: center;">
            <span class="game-options_optionLabel__Vk5xN" style="margin: 0; padding-right: 6px;">Rescramble</span>
            <input type="checkbox" id="enableRescrambleMode" onclick="toggleRescrambleMode(this)" class="toggle_toggle__qfXpL">
          </div>
          <div style="display: flex; align-items: center; margin-left: 16px;">
            <span class="game-options_optionLabel__Vk5xN" style="margin: 0; padding-right: 6px;">Rescramble ms</span>
            <input type="range" id="rescrambleTimeSlider" min="100" max="5000" step="100" value="${settings.rescrambleTime ?? 1000}" oninput="document.getElementById('rescrambleTimeValue').textContent=this.value; window.setRescrambleTime && window.setRescrambleTime(this.value)">
            <span id="rescrambleTimeValue">${settings.rescrambleTime ?? 1000}</span>
          </div>
          </div>`
        : ''
      }
      </div>
    `;
  }

  // Dynamically update the GUI when scramble is toggled
  const updateGui = () => {
    const controls = document.querySelector('#mods-controls');
    if (!controls) return;
    const oldGui = controls.querySelector('.section_sizeMedium__CuXRP');
    if (oldGui) oldGui.parentElement?.removeChild(oldGui);
    classicGameGuiHTML = getClassicGameGuiHTML(settings);
    // delete old classic game gui if exists before adding
    const existingGui = controls.querySelector('.start-standard-game_settings__x94PU');
    if (existingGui) {
      existingGui.parentElement?.removeChild(existingGui);
    }
    controls.insertAdjacentHTML('beforeend', classicGameGuiHTML);

    // Restore checked states
    if (settings.noCar) {
      (document.querySelector('#enableNoCar') as HTMLInputElement).checked = true;
    }
    if (settings.noCompass) {
      (document.querySelector('#enableNoCompass') as HTMLInputElement).checked = true;
    }
    if (settings.water) {
      (document.querySelector('#enableWaterMode') as HTMLInputElement).checked = true;
    }
    if (settings.scramble) {
      (document.querySelector('#enableScrambleMode') as HTMLInputElement).checked = true;
    }
    if (settings.rescramble) {
      if (document.querySelector('#enableRescrambleMode')) {
        (document.querySelector('#enableRescrambleMode') as HTMLInputElement).checked = true;
      }
    }
    if (settings.pixelate) {
      (document.querySelector('#enablePixelateMode') as HTMLInputElement).checked = true;
    }
    if (settings.greyscale) {
      (document.querySelector('#enableGreyscale') as HTMLInputElement).checked = true;
    }
    if (settings.toon) {
      (document.querySelector('#enableToonMode') as HTMLInputElement).checked = true;
    }
    if (settings.min) {
      (document.querySelector('#enableMinMode') as HTMLInputElement).checked = true;
    }
    if (settings.crt) {
      (document.querySelector('#enableCrtMode') as HTMLInputElement).checked = true;
    }
  };

  

  const checkInsertGui = () => {
    if (
      document.querySelector('#mods-controls') &&
      document.querySelector('#enableNoCar') === null
    ) {
      console.log("settings", settings)
      document
        .querySelector('#mods-controls')
        ?.insertAdjacentHTML('beforeend', classicGameGuiHTML)

      if (settings.noCar) {
        ;(document.querySelector('#enableNoCar') as HTMLInputElement).checked = true
      }

      if (settings.noCompass) {
        ;(document.querySelector('#enableNoCompass') as HTMLInputElement).checked = true
      }
      if (settings.water) {
        ;(document.querySelector('#enableWaterMode') as HTMLInputElement).checked = true
      }
      if (settings.scramble) {
        ;(document.querySelector('#enableScrambleMode') as HTMLInputElement).checked = true
      }
      if (settings.pixelate) {
        ;(document.querySelector('#enablePixelateMode') as HTMLInputElement).checked = true
      }
      if (settings.greyscale) {
        ;(document.querySelector('#enableGreyscale') as HTMLInputElement).checked = true
      }
      if (settings.toon) {
        ;(document.querySelector('#enableToonMode') as HTMLInputElement).checked = true
      }
      if (settings.min) {
        ;(document.querySelector('#enableMinMode') as HTMLInputElement).checked = true
      }
      if (settings.crt) {
        ;(document.querySelector('#enableCrtMode') as HTMLInputElement).checked = true
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
