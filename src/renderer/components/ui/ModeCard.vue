<template>
  <article class="mode-card" :class="{ 'is-active': active || enabled }">
    <div class="form__group card-heading">
      <h3>{{ title }}</h3>
      <input
        v-if="enabled !== undefined"
        v-model="enabled"
        type="checkbox"
        :aria-label="`Enable ${title}`"
      />
      <span v-else-if="active" class="active-label">Active</span>
    </div>
    <p class="description">{{ description }}</p>
    <div v-if="$slots.default && (enabled === undefined || enabled)" class="card-options">
      <slot />
    </div>
  </article>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  description: string
  active?: boolean
}>()
const enabled = defineModel<boolean>('enabled', { default: undefined })
</script>

<style scoped>
.mode-card {
  padding: 1rem;
  border: 1px solid rgb(255 255 255 / 15%);
  border-radius: 10px;
  background: rgb(255 255 255 / 4%);
  transition:
    border-color 0.15s,
    background 0.15s;
}

.mode-card.is-active {
  border-color: var(--primary);
  background: rgb(255 255 255 / 8%);
}

.card-heading {
  height: auto;
  gap: 0.5rem;
  margin: 0;
}

h3 {
  margin: 0;
  font-size: 1rem;
}

.description {
  margin: 0.5rem 0 0;
  font-size: 0.8rem;
  line-height: 1.5;
  opacity: 0.75;
}

.active-label {
  color: var(--primary);
  font-size: 0.75rem;
}

.card-options {
  margin-top: 0.85rem;
  padding-top: 0.85rem;
  border-top: 1px solid rgb(255 255 255 / 12%);
}
</style>
