<template>
  <Modal :is-visible="isVisible" @close="emit('close')">
    <div class="closest-location-modal">
      <div ref="panorama" class="panorama-container"></div>
      <button @click="emit('close')" class="close-button">Close</button>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Modal from './ui/Modal.vue';

import { watch } from 'vue';

const props = defineProps<{
  isVisible: boolean;
  location: LatLng | null;
}>();

const emit = defineEmits(['close']);

const panorama = ref<HTMLElement | null>(null);
const panoramaInstance = ref<google.maps.StreetViewPanorama | null>(null);

watch(() => props.isVisible, (isVisible) => {
  if (isVisible && props.location) {
    const streetViewService = new google.maps.StreetViewService();
    streetViewService.getPanorama({
      location: props.location,
      radius: 50,
      source: google.maps.StreetViewSource.OUTDOOR,
    }, (data, status) => {
      if (status === 'OK' && data && data.location && data.location.pano && panorama.value) {
        if (!panoramaInstance.value) {
          panoramaInstance.value = new window.OriginalStreetViewPanorama(panorama.value, {
            addressControl: false,
            showRoadLabels: false,
          });
        }
        panoramaInstance.value.setPano(data.location.pano);
        panoramaInstance.value.setVisible(true);
      } else {
        if (panorama.value) {
          panorama.value.innerHTML = '<p>No Street View found for this location.</p>';
        }
      }
    });
  }
});
</script>

<style scoped>
.closest-location-modal {
  width: 80vw;
  height: 80vh;
  display: flex;
  flex-direction: column;
}

.panorama-container {
  width: 100%;
  height: 100%;
  flex-grow: 1;
}

.close-button {
  margin-top: 10px;
  padding: 5px 10px;
  background-color: #f44336;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  align-self: center;
}
</style>
