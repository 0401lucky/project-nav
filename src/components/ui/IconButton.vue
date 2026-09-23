<script setup lang="ts">
defineProps<{
  label: string
  /** 危险操作用红调，比如删除 */
  danger?: boolean
}>()
</script>

<template>
  <button
    type="button"
    class="icon-button"
    :class="{ 'is-danger': danger }"
    :title="label"
    :aria-label="label"
  >
    <slot />
  </button>
</template>

<style scoped>
.icon-button {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  color: var(--text-2);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}

.icon-button:hover {
  background: rgb(255 255 255 / 0.12);
  color: var(--text);
}

.icon-button.is-danger:hover {
  background: rgb(220 80 80 / 0.22);
  color: rgb(255 190 190);
}
</style>
