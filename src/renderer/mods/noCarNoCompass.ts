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
    tileReveal: false,
    visibleTileCount: 10,
    rescrambleTime: 1000,
    scrambleGridSize: 4,
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

  const restorePostProcessingSettings = () => {
    if (!window.ppController) return

    settings.rescrambleTime = Math.max(100, Math.min(5000, Number(settings.rescrambleTime) || 1000))
    settings.scrambleGridSize = [2, 3, 4, 5, 6, 7, 8].includes(Number(settings.scrambleGridSize))
      ? Number(settings.scrambleGridSize)
      : 4
    const savedVisibleTileCount = Number(settings.visibleTileCount ?? 10)
    settings.visibleTileCount = Number.isFinite(savedVisibleTileCount)
      ? Math.max(0, Math.min(64, Math.round(savedVisibleTileCount)))
      : 10
    settings.tileReveal = Boolean(settings.tileReveal)
    if (settings.tileReveal) {
      settings.scramble = false
      settings.rescramble = false
    }

    Object.assign(window.pp, {
      hideCar: settings.noCar,
      water: settings.water,
      scramble: settings.scramble && !settings.rescramble && !settings.tileReveal,
      rescramble: settings.scramble && settings.rescramble,
      tileReveal: settings.tileReveal,
      rescrambleTime: settings.rescrambleTime,
      scrambleGridSize: settings.scrambleGridSize,
      visibleTileCount: Math.min(settings.visibleTileCount, settings.scrambleGridSize ** 2),
      pixelate: settings.pixelate,
      pixelScale: settings.pixelScale,
      toon: settings.toon,
      toonScale: settings.toonScale,
      crt: settings.crt,
      min: settings.min
    })

    try {
      window.ppController.updateState(window.pp)
    } catch {
      // Older saved settings can contain multiple mutually exclusive filters.
      for (const key of ['water', 'scramble', 'rescramble', 'tileReveal', 'pixelate', 'crt', 'min']) {
        settings[key] = false
        window.pp[key] = false
      }
      setLocalStorage('cg_ncnc__settings', settings)
      window.ppController.updateState(window.pp)
    }
  }

  restorePostProcessingSettings()

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
    if (!settings.scramble) settings.rescramble = false
    if (settings.scramble) settings.tileReveal = false
    setLocalStorage('cg_ncnc__settings', settings)
    updateGui()
    if (window.ppController) {
      window.pp.scramble = settings.scramble
      window.pp.rescramble = settings.rescramble
      window.pp.tileReveal = settings.tileReveal
      window.ppController.updateState(window.pp)
    }
  }
  window.toggleRescrambleMode = (el) => {
    settings.rescramble = settings.scramble && el.checked
    setLocalStorage('cg_ncnc__settings', settings)
    if (window.ppController) {
      window.pp.scramble = settings.scramble && !settings.rescramble
      window.pp.rescramble = settings.rescramble
      window.ppController.updateState(window.pp)
    }
  }
  window.toggleTileRevealMode = (el) => {
    settings.tileReveal = el.checked
    if (settings.tileReveal) {
      for (const key of ['water', 'scramble', 'rescramble', 'pixelate', 'crt', 'min']) {
        settings[key] = false
        if (window.pp) window.pp[key] = false
      }
    }
    setLocalStorage('cg_ncnc__settings', settings)
    updateGui()
    if (window.ppController) {
      window.pp.tileReveal = settings.tileReveal
      window.pp.visibleTileCount = Math.min(settings.visibleTileCount, settings.scrambleGridSize ** 2)
      window.ppController.updateState(window.pp)
    }
  }
  window.setRescrambleTime = (value) => {
    settings.rescrambleTime = Math.max(100, Math.min(5000, Number(value) || 1000))
    setLocalStorage('cg_ncnc__settings', settings)
    if (window.ppController) {
      window.pp.rescrambleTime = settings.rescrambleTime
      window.ppController.updateState(window.pp)
    }
  }
  window.setScrambleGridSize = (value) => {
    const gridSize = Number(value)
    if (![2, 3, 4, 5, 6, 7, 8].includes(gridSize)) return
    settings.scrambleGridSize = gridSize
    setLocalStorage('cg_ncnc__settings', settings)
    if (window.ppController) {
      window.pp.scrambleGridSize = gridSize
      window.pp.visibleTileCount = Math.min(settings.visibleTileCount, gridSize ** 2)
      window.ppController.updateState(window.pp)
    }
    updateGui()
  }
  window.setVisibleTileCount = (value) => {
    settings.visibleTileCount = Math.max(
      0,
      Math.min(settings.scrambleGridSize ** 2, Math.round(Number(value) || 0))
    )
    setLocalStorage('cg_ncnc__settings', settings)
    if (window.ppController) {
      window.pp.visibleTileCount = settings.visibleTileCount
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
      <div class="section_sizeMedium cg-ncnc-heading">
      <div class="bars_root bars_center">
        <div class="bars_before"></div>
        <span class="bars_content"><h3>NCNC settings</h3></span>
        <div class="bars_after"></div>
      </div>
      </div>
      <div class="start-standard-game_settings cg-ncnc-settings">
      <div style="display: flex; justify-content: space-between">
        <div style="display: flex; align-items: center">
        <span class="game-options_optionLabel" style="margin: 0; padding-right: 6px;">No car</span>
        <input type="checkbox" id="enableNoCar" onclick="toggleNoCarMode(this)" class="toggle_toggle">
        </div>
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel" style="margin: 0; padding-right: 6px;">No compass</span>
        <input type="checkbox" id="enableNoCompass" onclick="toggleNoCompassMode(this)" class="toggle_toggle">
        </div>
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel" style="margin: 0; padding-right: 6px;">Water Filter</span>
        <input type="checkbox" id="enableWaterMode" onclick="toggleWaterMode(this)" class="toggle_toggle">
        </div>
      </div>
      <div style="display: flex; justify-content: space-between">
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel" style="margin: 0; padding-right: 6px;">Greyscale</span>
        <input type="checkbox" id="enableGreyscale" onclick="toggleGreyscale(this)" class="toggle_toggle">
        </div>
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel" style="margin: 0; padding-right: 6px;">Sepia</span>
        <input type="checkbox" id="enableSepia" onclick="toggleSepia(this)" class="toggle_toggle">
        </div>
        
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel" style="margin: 0; padding-right: 6px;">Upsidedown</span>
        <input type="checkbox" id="enableUpsidedown" onclick="toggleUpsidedown(this)" class="toggle_toggle">
        </div>
      </div>
      <div style="display: flex; justify-content: space-between">
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel" style="margin: 0; padding-right: 6px;">Crt</span>
        <input type="checkbox" id="enableCrtMode" onclick="toggleCrtMode(this)" class="toggle_toggle">
        </div>
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel" style="margin: 0; padding-right: 6px;">Min</span>
        <input type="checkbox" id="enableMinMode" onclick="toggleMinMode(this)" class="toggle_toggle">
        </div>
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel" style="margin: 0; padding-right: 6px;">Toon</span>
        <input type="checkbox" id="enableToonMode" onclick="toggleToonMode(this)" class="toggle_toggle">
        </div>
      </div>
      <div style="display: flex; justify-content: space-between">
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel" style="margin: 0; padding-right: 6px;">Scramble</span>
        <input type="checkbox" id="enableScrambleMode" onclick="toggleScrambleMode(this)" class="toggle_toggle">
        </div>
        
        <div style="display: flex; align-items: center;">
        <span class="game-options_optionLabel" style="margin: 0; padding-right: 6px;">Pixelate</span>
        <input type="checkbox" id="enablePixelateMode" onclick="togglePixelateMode(this)" class="toggle_toggle">
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 6px; margin-top: 8px;">
        <span class="game-options_optionLabel" style="margin: 0; padding-right: 6px;">Scramble tiles</span>
        <select id="scrambleGridSize" onchange="window.setScrambleGridSize && window.setScrambleGridSize(this.value)">
          <option value="2" ${settings.scrambleGridSize === 2 ? 'selected' : ''}>2×2 (4)</option>
          <option value="3" ${settings.scrambleGridSize === 3 ? 'selected' : ''}>3×3 (9)</option>
          <option value="4" ${settings.scrambleGridSize === 4 || !settings.scrambleGridSize ? 'selected' : ''}>4×4 (16)</option>
          <option value="5" ${settings.scrambleGridSize === 5 ? 'selected' : ''}>5×5 (25)</option>
          <option value="6" ${settings.scrambleGridSize === 6 ? 'selected' : ''}>6×6 (36)</option>
          <option value="7" ${settings.scrambleGridSize === 7 ? 'selected' : ''}>7×7 (49)</option>
          <option value="8" ${settings.scrambleGridSize === 8 ? 'selected' : ''}>8×8 (64)</option>
        </select>
      </div>

      <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; margin-top: 8px;">
        <div style="display: flex; align-items: center;">
          <span class="game-options_optionLabel" style="margin: 0; padding-right: 6px;">Tile reveal</span>
          <input type="checkbox" id="enableTileRevealMode" onclick="toggleTileRevealMode(this)" class="toggle_toggle">
        </div>
        ${settings.tileReveal ? `<div style="display: flex; align-items: center; gap: 6px;">
          <span class="game-options_optionLabel" style="margin: 0; padding-right: 6px;">Visible tiles</span>
          <input type="range" id="visibleTileCountSlider" style="width: 120px;" min="0" max="${settings.scrambleGridSize ** 2}" step="1" value="${Math.min(settings.visibleTileCount, settings.scrambleGridSize ** 2)}" oninput="document.getElementById('visibleTileCountValue').textContent=this.value; window.setVisibleTileCount && window.setVisibleTileCount(this.value)">
          <span id="visibleTileCountValue">${Math.min(settings.visibleTileCount, settings.scrambleGridSize ** 2)}</span>
        </div>` : ''}
      </div>

      ${
        settings.scramble
        ? `<div style="display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center;">
          <div style="display: flex; align-items: center;">
            <span class="game-options_optionLabel" style="margin: 0; padding-right: 6px;">Rescramble</span>
            <input type="checkbox" id="enableRescrambleMode" onclick="toggleRescrambleMode(this)" class="toggle_toggle">
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="game-options_optionLabel" style="margin: 0; padding-right: 6px;">Rescramble ms</span>
            <input type="range" id="rescrambleTimeSlider" style="width: 120px;" min="100" max="5000" step="100" value="${settings.rescrambleTime ?? 1000}" oninput="document.getElementById('rescrambleTimeValue').textContent=this.value; window.setRescrambleTime && window.setRescrambleTime(this.value)">
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
    const oldGui = controls.querySelector('.cg-ncnc-heading');
    if (oldGui) oldGui.parentElement?.removeChild(oldGui);
    classicGameGuiHTML = getClassicGameGuiHTML(settings);
    // delete old classic game gui if exists before adding
    const existingGui = controls.querySelector('.cg-ncnc-settings');
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
    if (settings.tileReveal) {
      (document.querySelector('#enableTileRevealMode') as HTMLInputElement).checked = true;
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
      if (settings.tileReveal) {
        ;(document.querySelector('#enableTileRevealMode') as HTMLInputElement).checked = true
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
