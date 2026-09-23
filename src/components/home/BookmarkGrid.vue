<script setup lang="ts">
import GroupPanel from '@/components/home/GroupPanel.vue'
import { useFilter } from '@/composables/useFilter'
import { useHomeContext } from '@/composables/homeContext'
import { useDataStore } from '@/stores/data'

const data = useDataStore()
const { visibleByGroup } = useFilter()
const { drag } = useHomeContext()
</script>

<template>
  <div v-if="data.isEmpty" class="empty">
    <p class="empty__title">还没有书签</p>
    <p class="empty__hint">点右上角「新增」开始收藏</p>
  </div>

  <div v-else class="panels">
    <div
      v-for="(entry, index) in visibleByGroup"
      :key="entry.group.id"
      class="panels__cell"
      :class="{ 'is-drop-before': drag.isGroupDropBefore(index) }"
      @dragover.prevent="drag.overGroup($event, index)"
      @drop.prevent="drag.dropGroup()"
    >
      <GroupPanel :entry="entry" :group-index="index" />
    </div>
  </div>
</template>

<style scoped>
.panels {
  display: grid;
  gap: 14px;
}

.panels__cell {
  position: relative;
}

/* 分组排序的落点线横跨整块面板，和卡片那条竖线区分开 */
.panels__cell.is-drop-before::before {
  content: '';
  position: absolute;
  top: -8px;
  left: 0;
  right: 0;
  height: 2px;
  border-radius: 2px;
  background: var(--accent);
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
