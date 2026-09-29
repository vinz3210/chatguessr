<template>
  <button
    type="button"
    :class="['speak-button', state, { small }]"
    :title="titles[state]"
    @click="emit('click')"
  >
    <svg v-if="state === 'playing'" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
    <svg v-else viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 9h4l5-4v14l-5-4H3z" />
      <path class="wave" d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  </button>
</template>

<script setup lang="ts">
import type { SpeechState } from '../../speech'

defineProps<{ state: SpeechState; small?: boolean }>()
const emit = defineEmits<{ click: [] }>()

const titles: Record<SpeechState, string> = {
  idle: 'Read aloud',
  loading: 'Generating speech… (click to cancel)',
  playing: 'Stop reading'
}
</script>

<style scoped>
.speak-button {
  display: inline-flex;
  flex-shrink: 0;
  width: 2.2rem;
  height: 2.2rem;
  padding: 0.45rem;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.2s;
}
.speak-button.small {
  width: 1.8rem;
  height: 1.8rem;
  padding: 0.35rem;
}
.speak-button:hover {
  background: rgba(255, 255, 255, 0.2);
}
.speak-button svg {
  width: 100%;
  height: 100%;
  fill: currentColor;
}
.speak-button .wave {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}
.speak-button.loading {
  animation: speak-pulse 1.6s ease-in-out infinite;
}
.speak-button.playing {
  color: var(--primary);
  border-color: var(--primary);
}

@keyframes speak-pulse {
  50% {
    opacity: 0.45;
  }
}
</style>
