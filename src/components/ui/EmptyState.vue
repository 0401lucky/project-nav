<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="empty glass">
    <div class="orb">
      <div class="orb-inner"></div>
    </div>
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <div class="empty-action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.empty {
  padding: var(--space-7) var(--space-6);
  text-align: center;
  display: grid;
  place-items: center;
  gap: var(--space-3);
  max-width: 520px;
  margin: var(--space-7) auto;
}

.orb {
  width: 96px;
  height: 96px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(192, 132, 252, 0.4),
    rgba(34, 211, 238, 0.2) 60%,
    transparent 80%
  );
  filter: blur(0.5px);
  margin-bottom: var(--space-3);
}

.orb-inner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--aurora-1), var(--aurora-2));
  box-shadow: 0 0 32px var(--aurora-1);
  animation: orb-pulse 3s var(--ease-out-soft) infinite;
}

@keyframes orb-pulse {
  0%, 100% { transform: scale(1); opacity: 0.85; }
  50%      { transform: scale(1.2); opacity: 1; }
}

h3 {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-primary);
}

p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.6;
  max-width: 360px;
}

.empty-action {
  margin-top: var(--space-4);
}
</style>
