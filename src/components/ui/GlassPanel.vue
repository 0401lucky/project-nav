<script setup lang="ts">
defineProps<{
  padding?: string
  radius?: string
  strong?: boolean
  hover?: boolean
}>()
</script>

<template>
  <div
    class="glass-panel glass"
    :class="{ 'glass-strong': strong, hoverable: hover }"
    :style="{
      padding: padding,
      borderRadius: radius,
    }"
  >
    <slot />
  </div>
</template>

<style scoped>
.glass-panel {
  position: relative;
  transition:
    transform 0.4s var(--ease-out-soft),
    border-color 0.3s var(--ease-out-soft),
    box-shadow 0.4s var(--ease-out-soft);
}

.glass-panel.hoverable:hover {
  border-color: var(--line-strong);
  box-shadow:
    0 1px 0 0 rgba(255, 255, 255, 0.12) inset,
    0 0 0 1px rgba(255, 255, 255, 0.1) inset,
    0 20px 60px rgba(0, 0, 0, 0.5),
    var(--shadow-glow-aurora);
}
</style>
