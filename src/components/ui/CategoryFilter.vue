<script setup lang="ts">
defineProps<{
  categories: string[]
  active: string | null
  total: number
}>()

defineEmits<{
  (e: 'change', value: string | null): void
}>()
</script>

<template>
  <div class="cat-filter">
    <span class="rail-label" aria-hidden="true">INDEX ·</span>
    <button
      class="cat"
      :class="{ on: active === null }"
      @click="$emit('change', null)"
    >
      <span>全部</span>
      <span class="num">{{ total }}</span>
    </button>
    <button
      v-for="cat in categories"
      :key="cat"
      class="cat"
      :class="{ on: active === cat }"
      @click="$emit('change', cat)"
    >
      <span>{{ cat }}</span>
    </button>
  </div>
</template>

<style scoped>
.cat-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.rail-label {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--text-subtle);
  margin-right: var(--space-2);
  user-select: none;
}

.cat {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 30px;
  border-radius: var(--radius-full);
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  color: var(--text-secondary);
  font-size: 12.5px;
  font-weight: 500;
  transition:
    background 0.15s var(--ease-out-soft),
    border-color 0.15s var(--ease-out-soft),
    color 0.15s var(--ease-out-soft),
    box-shadow 0.15s var(--ease-out-soft);
}

.cat:hover {
  color: var(--text-primary);
  border-color: var(--line-strong);
  background: var(--surface-glass-strong);
}

.cat.on {
  background: var(--accent);
  border-color: var(--aurora-3);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 3px 10px rgba(207, 69, 32, 0.28);
}

.num {
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  font-size: 11px;
  padding: 1px 6px;
  background: var(--bg-sunken);
  border-radius: var(--radius-full);
  font-weight: 600;
  font-family: var(--font-mono);
}

.cat:hover .num {
  background: rgba(48, 38, 28, 0.1);
  color: var(--text-secondary);
}

.cat.on .num {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}
</style>
