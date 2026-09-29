import PostProcessingController, { PostProcessingState } from "./extenssr/post_processing_controller"

interface Window {
  toggleNoCarMode: (el: HTMLInputElement) => void
  toggleNoCompassMode: (el: HTMLInputElement) => void
  toggleGreyscale: (el: HTMLInputElement) => void	  
  toggleUpsidedown: (el: HTMLInputElement) => void	  
  toggleSepia: (el: HTMLInputElement) => void	  
  toggleWaterMode: (el: HTMLInputElement) => void
  toggleScrambleMode: (el: HTMLInputElement) => void
  toggleRescrambleMode: (el: HTMLInputElement) => void
  setRescrambleTime: (value: number) => void
  setScrambleGridSize: (value: number) => void
  toggleTileRevealMode: (el: HTMLInputElement) => void
  setVisibleTileCount: (value: number) => void
  togglePixelateMode: (el: HTMLInputElement) => void
  toggleBlinkMode: (el: HTMLInputElement) => void
  changeBlinkTime: (el: HTMLInputElement) => void
  changeDelayTime: (el: HTMLInputElement) => void
  toggleSatelliteMode: (el: HTMLInputElement) => void
  changeBoundsLimit: (el: HTMLInputElement) => void
  toggleToonMode: (el: HTMLInputElement) => void
  toggleMinMode: (el: HTMLInputElement) => void
  toggleCrtMode: (el: HTMLInputElement) => void
  pp: PostProcessingState
  ppController: PostProcessingController | null
}
