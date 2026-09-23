<script setup lang="ts">
import { useDataStore } from '@/stores/data'
import IconButton from '@/components/ui/IconButton.vue'

const emit = defineEmits<{ add: []; settings: [] }>()

const data = useDataStore()
</script>

<template>
  <header class="topbar">
    <div class="topbar__brand">
      <span class="topbar__title">书签</span>
      <span v-if="data.total > 0" class="topbar__count">{{ data.total }}</span>
    </div>

    <div class="topbar__actions">
      <button class="topbar__add" type="button" @click="emit('add')">新增</button>
      <IconButton label="设置" @click="emit('settings')">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
            stroke="currentColor"
            stroke-width="1.7"
          />
          <path
            d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.86a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.08 4.1l.06.06a1.7 1.7 0 0 0 1.87.34H9.1a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z"
            stroke="currentColor"
            stroke-width="1.5"
          />
        </svg>
      </IconButton>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--topbar-h);
  padding: 0 var(--page-x);
  flex: 0 0 auto;
}

.topbar__brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.topbar__title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.16em;
}

.topbar__count {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.topbar__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.topbar__add {
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  background: var(--glass-card);
  border: 1px solid var(--stroke);
  border-radius: var(--r-pill);
  transition: background var(--dur) var(--ease);
}

.topbar__add:hover {
  background: var(--glass-card-hover);
}
</style>
