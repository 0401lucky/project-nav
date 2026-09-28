<script setup lang="ts">
import GroupPanel from '@/components/home/GroupPanel.vue'
import { useFilter } from '@/composables/useFilter'
import { useHomeContext } from '@/composables/homeContext'
import { useDataStore } from '@/stores/data'

const data = useDataStore()
const { visibleByGroup } = useFilter()
const { drag, actions } = useHomeContext()
</script>

<template>
  <!-- 没有分组时书签保存不了（表单要求选分组），所以这里引导先建分组 -->
  <div v-if="data.isEmpty" class="empty">
    <p class="empty__title">还没有书签</p>
    <p class="empty__hint">先建一个分组，再往里添加书签</p>
    <button class="add-group empty__action" type="button" @click="actions.addGroup()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      </svg>
      新建分组
    </button>
  </div>

  <!-- 多列错落：按「先排满第一列再排下一列」的顺序，拖拽只看 DOM 顺序，不受影响 -->
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

    <!-- 次要入口，放在列表末尾；不接拖放事件，分组拖到这里不算落点 -->
    <div class="panels__cell">
      <button class="add-group" type="button" @click="actions.addGroup()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
        新建分组
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 宽度够时排 3 列（每列最小 220px），1 张卡片的分组不再独占一整行 */
.panels {
  columns: 3 220px;
  column-gap: 20px;
}

.panels__cell {
  position: relative;
  break-inside: avoid;
  padding-bottom: 14px;
}

/* 分组排序的落点线横跨整块分组，落在上一格留出的间距里 */
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

/* 新建分组：虚线、弱色，比顶栏的「新增」低一档 */
.add-group {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 34px;
  font-size: 12px;
  color: var(--text-3);
  border: 1px dashed var(--stroke-strong);
  border-radius: var(--r-card);
  transition: color var(--dur) var(--ease), border-color var(--dur) var(--ease);
}

.add-group:hover {
  color: var(--text);
  border-color: var(--text-3);
}

.empty {
  display: grid;
  gap: 6px;
  place-content: center;
  justify-items: center;
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

.empty__action {
  width: 160px;
  margin-top: 10px;
}

@media (max-width: 640px) {
  .panels {
    columns: 1;
  }
}
</style>
