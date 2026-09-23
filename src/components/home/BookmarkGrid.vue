<script setup lang="ts">
import GroupPanel from '@/components/home/GroupPanel.vue'
import { useFilter } from '@/composables/useFilter'
import { useDataStore } from '@/stores/data'

const data = useDataStore()
const { visibleByGroup } = useFilter()
</script>

<template>
  <div v-if="data.isEmpty" class="empty">
    <p class="empty__title">还没有书签</p>
    <p class="empty__hint">点右上角「新增」开始收藏</p>
  </div>

  <div v-else class="panels">
    <GroupPanel v-for="entry in visibleByGroup" :key="entry.group.id" :entry="entry" />
  </div>
</template>

<style scoped>
.panels {
  display: grid;
  gap: 14px;
}

.empty {
  display: grid;
  gap: 6px;
  place-content: center;
  padding: 80px 0;
  text-align: center;
}

.empty__title {
  font-size: 15px;
  color: var(--text-2);
}

.empty__hint {
  font-size: 13px;
  color: var(--text-3);
}
</style>
