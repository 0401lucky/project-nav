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
  gap: var(--space-2);
}

.cat {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  height: 36px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(var(--blur-md));
  -webkit-backdrop-filter: blur(var(--blur-md));
  border: 1px solid rgba(255, 255, 255, 0.8);
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
  transition: all 0.3s var(--ease-spring-bounce);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.02);
}

.cat:hover {
  color: var(--text-primary);
  border-color: rgba(255, 51, 102, 0.3);
  background: rgba(255, 255, 255, 0.9);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.05);
}

.cat.on {
  background: linear-gradient(
    135deg,
    var(--aurora-1),
    var(--aurora-3)
  );
  border-color: transparent;
  color: #fff;
  box-shadow: 0 8px 20px rgba(255, 51, 102, 0.4);
  transform: translateY(-2px) scale(1.02);
}

.num {
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  font-size: 12px;
  padding: 1px 6px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: var(--radius-full);
  font-weight: 700;
}

.cat:hover .num {
  background: rgba(255, 51, 102, 0.1);
  color: var(--aurora-1);
}

.cat.on .num {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}
</style>
