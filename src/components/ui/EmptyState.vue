<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="empty glass">
    <div class="radar" aria-hidden="true">
      <span class="radar-ring r1"></span>
      <span class="radar-ring r2"></span>
      <span class="radar-sweep"></span>
      <span class="radar-core"></span>
    </div>
    <span class="empty-code">· INDEX EMPTY ·</span>
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

/* 雷达扫描图形 */
.radar {
  position: relative;
  width: 96px;
  height: 96px;
  margin-bottom: var(--space-3);
}

.radar-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid rgba(207, 69, 32, 0.25);
}
.radar-ring.r2 {
  inset: 22px;
  border-color: rgba(207, 69, 32, 0.18);
}

.radar-sweep {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    rgba(207, 69, 32, 0.35) 0deg,
    transparent 70deg,
    transparent 360deg
  );
  animation: radar-spin 3.5s linear infinite;
  mask-image: radial-gradient(circle, #000 0%, #000 100%);
}

@keyframes radar-spin {
  to { transform: rotate(360deg); }
}

.radar-core {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 6px;
  height: 6px;
  margin: -3px 0 0 -3px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 12px rgba(207, 69, 32, 0.8);
}

@media (prefers-reduced-motion: reduce) {
  .radar-sweep { animation: none; opacity: 0.4; }
}

.empty-code {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.22em;
  color: var(--text-subtle);
}

h3 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-primary);
}

p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.6;
  max-width: 360px;
  font-size: 13.5px;
}

.empty-action {
  margin-top: var(--space-4);
}
</style>
