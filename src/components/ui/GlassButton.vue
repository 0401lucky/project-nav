<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    icon?: boolean
    disabled?: boolean
  }>(),
  { variant: 'secondary', size: 'md' },
)
</script>

<template>
  <button
    class="glass-btn"
    :class="[`v-${variant}`, `s-${size}`, { 'icon-only': icon }]"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<style scoped>
.glass-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  height: 38px;
  border-radius: var(--radius-full);
  background: var(--surface-glass);
  backdrop-filter: blur(var(--blur-md)) saturate(1.4);
  -webkit-backdrop-filter: blur(var(--blur-md)) saturate(1.4);
  border: 1px solid var(--line);
  color: var(--text-primary);
  font-size: 13.5px;
  font-weight: 500;
  letter-spacing: 0.01em;
  transition:
    transform 0.2s var(--ease-out-soft),
    background 0.2s var(--ease-out-soft),
    border-color 0.2s var(--ease-out-soft),
    box-shadow 0.3s var(--ease-out-soft);
  white-space: nowrap;
  user-select: none;
}

.glass-btn:hover:not(:disabled) {
  border-color: var(--line-strong);
  background: var(--surface-glass-strong);
  transform: translateY(-1px);
}
.glass-btn:active:not(:disabled) {
  transform: translateY(0);
}
.glass-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.s-sm { height: 30px; padding: 0 var(--space-3); font-size: 12.5px; }
.s-lg { height: 46px; padding: 0 var(--space-5); font-size: 14.5px; }

.icon-only { padding: 0; width: 38px; }
.icon-only.s-sm { width: 30px; }
.icon-only.s-lg { width: 46px; }

.v-primary {
  background: linear-gradient(
    135deg,
    var(--aurora-1),
    var(--aurora-2)
  );
  border-color: transparent;
  color: #fff;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.18) inset,
    0 8px 28px rgba(192, 132, 252, 0.4);
}
.v-primary:hover:not(:disabled) {
  filter: brightness(1.1) saturate(1.2);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.28) inset,
    0 12px 36px rgba(192, 132, 252, 0.55);
}

.v-ghost {
  background: transparent;
  border-color: transparent;
}
.v-ghost:hover:not(:disabled) {
  background: var(--surface-glass);
  border-color: var(--line);
}

.v-danger {
  border-color: rgba(248, 113, 113, 0.5);
  color: #fca5a5;
}
.v-danger:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.12);
  border-color: rgba(248, 113, 113, 0.7);
}
</style>
