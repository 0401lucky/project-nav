<script setup lang="ts">
import { computed } from 'vue'
import BookmarkCard from '@/components/home/BookmarkCard.vue'
import { useFilter } from '@/composables/useFilter'
import { useHomeContext } from '@/composables/homeContext'
import type { GroupWithBookmarks } from '@/stores/data'
import type { Bookmark } from '@/types'

const props = defineProps<{ entry: GroupWithBookmarks; groupIndex: number }>()

// 高亮区间来自搜索，直接在这里取，省得把整张表 prop 透传下来
const { result, query } = useFilter()
const { drag, actions } = useHomeContext()

/**
 * 过滤状态下不给拖：重排接口要求带上该分组的**全部**书签 id，
 * 而过滤后只剩子集，提交上去会被服务端判为「缺项」直接 400。
 */
const filtering = computed(() => query.value.trim() !== '')

function onCardRemove(bookmark: Bookmark): void {
  actions.remove(bookmark)
}
</script>

<template>
  <section
    class="panel"
    :class="{ 'is-dragging-over': drag.isDropAtEnd(entry.group.id, entry.bookmarks.length) }"
    @dragover.prevent="drag.overGroupBody(entry.group.id)"
    @drop.prevent="drag.dropBookmark()"
  >
    <header class="panel__head">
      <span
        v-if="!filtering"
        class="panel__handle"
        draggable="true"
        role="button"
        tabindex="-1"
        aria-label="拖动分组排序"
        title="拖动分组排序"
        @dragstart="drag.startGroup($event, entry.group)"
        @dragend="drag.end()"
        @click.prevent.stop
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
          <circle cx="2.5" cy="3" r="1.3" />
          <circle cx="7.5" cy="3" r="1.3" />
          <circle cx="2.5" cy="7" r="1.3" />
          <circle cx="7.5" cy="7" r="1.3" />
          <circle cx="2.5" cy="11" r="1.3" />
          <circle cx="7.5" cy="11" r="1.3" />
        </svg>
      </span>

      <span v-if="entry.group.icon" class="panel__icon" aria-hidden="true">{{ entry.group.icon }}</span>
      <h2 class="panel__name" :title="entry.group.name">{{ entry.group.name }}</h2>
      <span class="panel__count">{{ entry.bookmarks.length }}</span>

      <button class="panel__action" type="button" @click="actions.addBookmark(entry.group)">添加</button>
      <button class="panel__action" type="button" @click="actions.editGroup(entry.group)">编辑</button>
    </header>

    <p v-if="entry.bookmarks.length === 0" class="panel__empty">拖动书签到这里，或点「添加」</p>

    <ul v-else class="panel__grid">
      <li
        v-for="(bookmark, index) in entry.bookmarks"
        :key="bookmark.id"
        class="panel__cell"
        :class="{ 'is-drop-before': drag.isDropBefore(entry.group.id, index) && !filtering }"
        @dragover.prevent="drag.overBookmark($event, entry.group.id, index)"
        @drop.prevent="drag.dropBookmark()"
      >
        <BookmarkCard
          :bookmark="bookmark"
          :highlight="result.highlights.get(bookmark.id)"
          :drag="
            filtering
              ? undefined
              : {
                  onStart: (event: DragEvent) => drag.startBookmark(event, bookmark),
                  onEnd: drag.end,
                }
          "
          @edit="actions.edit(bookmark)"
          @remove="onCardRemove(bookmark)"
          @move="actions.move(bookmark)"
        />
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* 分组面板：允许用 backdrop-filter 的三类容器之一 */
.panel {
  padding: 14px;
  background: var(--glass-panel);
  border: 1px solid var(--stroke);
  border-radius: var(--r-panel);
  backdrop-filter: blur(var(--blur-panel));
  transition: border-color var(--dur) var(--ease);
}

.panel.is-dragging-over {
  border-color: var(--accent);
}

.panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.panel__handle {
  display: grid;
  place-items: center;
  width: 12px;
  margin-left: -4px;
  color: var(--text-3);
  opacity: 0;
  cursor: grab;
  transition: opacity var(--dur) var(--ease);
}

.panel:hover .panel__handle {
  opacity: 1;
}

.panel__handle:active {
  cursor: grabbing;
}

.panel__icon {
  font-size: 14px;
  line-height: 1;
}

.panel__name {
  flex: 0 1 auto;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel__count {
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.panel__action {
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-2);
  background: rgb(255 255 255 / 0.06);
  border: 1px solid var(--stroke);
  border-radius: var(--r-pill);
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}

/* 把前两个按钮顶到右边 */
.panel__count + .panel__action {
  margin-left: auto;
}

.panel__action:hover {
  background: rgb(255 255 255 / 0.14);
  color: var(--text);
}

.panel__empty {
  padding: 10px 2px 4px;
  font-size: 12px;
  color: var(--text-3);
}

.panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--gap);
}

.panel__cell {
  position: relative;
  min-width: 0;
}

/* 落点指示线：靠左边缘的一条竖线，比整格高亮更不打扰 */
.panel__cell.is-drop-before::before {
  content: '';
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: -6px;
  width: 2px;
  border-radius: 2px;
  background: var(--accent);
}
@media (max-width: 640px) {
  /* 小屏固定 3 列，不再按容器宽度自动铺开 */
  .panel__grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .panel__handle {
    display: none;
  }

  .panel {
    padding: 11px;
  }
}
</style>
