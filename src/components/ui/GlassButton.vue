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
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  backdrop-filter: blur(var(--blur-sm));
  -webkit-backdrop-filter: blur(var(--blur-sm));
  border: 1px solid var(--line);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.005em;
  transition:
    transform 0.15s var(--ease-out-soft),
    background 0.15s var(--ease-out-soft),
    border-color 0.15s var(--ease-out-soft),
    box-shadow 0.2s var(--ease-out-soft);
  white-space: nowrap;
  user-select: none;
}

.glass-btn:hover:not(:disabled) {
  border-color: var(--line-strong);
  background: var(--bg-sunken);
}
.glass-btn:active:not(:disabled) {
  transform: translateY(1px);
}
.glass-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.s-sm { height: 30px; padding: 0 var(--space-3); font-size: 12px; border-radius: var(--radius-md); }
.s-lg { height: 42px; padding: 0 var(--space-5); font-size: 14px; border-radius: var(--radius-lg); }

.icon-only { padding: 0; width: 36px; }
.icon-only.s-sm { width: 30px; }
.icon-only.s-lg { width: 42px; }

/* 主按钮：朱红实底 + 白字，刊头强调键 */
.v-primary {
  background: linear-gradient(180deg, #e0592e 0%, var(--aurora-3) 100%);
  border-color: var(--aurora-3);
  color: #fff;
  font-weight: 600;
  box-shadow:
    0 1px 0 0 rgba(255, 255, 255, 0.28) inset,
    0 4px 14px rgba(207, 69, 32, 0.28);
}
.v-primary:hover:not(:disabled) {
  filter: brightness(1.06);
  border-color: rgba(207, 69, 32, 0.9);
  box-shadow:
    0 1px 0 0 rgba(255, 255, 255, 0.4) inset,
    0 6px 20px rgba(207, 69, 32, 0.4);
}

.v-ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-secondary);
}
.v-ghost:hover:not(:disabled) {
  background: var(--bg-sunken);
  border-color: var(--line);
  color: var(--text-primary);
}

.v-danger {
  border-color: rgba(220, 38, 38, 0.35);
  color: #b91c1c;
  background: rgba(220, 38, 38, 0.06);
}
.v-danger:hover:not(:disabled) {
  background: rgba(220, 38, 38, 0.12);
  border-color: rgba(220, 38, 38, 0.55);
}
</style>
