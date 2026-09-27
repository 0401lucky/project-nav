<script setup lang="ts">
import { computed } from 'vue'
import BookmarkCard from '@/components/home/BookmarkCard.vue'
import { useFilter } from '@/composables/useFilter'
import { useHomeContext } from '@/composables/homeContext'
import type { GroupWithBookmarks } from '@/stores/data'
import type { Bookmark } from '@/types'

const props = defineProps<{ entry: GroupWithBookmarks; groupIndex: number }>()

// 高亮区间来自搜索，直接在这里取，省得把整张表 prop 透传下来
const { result, query, activeBookmark } = useFilter()
const { drag, actions } = useHomeContext()

/**
 * 过滤状态下不给拖：重排接口要求带上该分组的**全部**书签 id，
 * 而过滤后只剩子集，提交上去会被服务端判为「缺项」直接 400。
 * 窄屏同样不给拖，由 canDrag 负责。
 */
const filtering = computed(() => query.value.trim() !== '')
const draggable = computed(() => !filtering.value && drag.canDrag.value)

/**
 * 标题栏整条可拖，但从「添加」「编辑」按钮上按下时不能起拖。
 * dragstart 的 target 是标题栏本身而不是按钮，只能在按下那一刻记住落点。
 */
let pressedOnButton = false

function onHeadPointerDown(event: PointerEvent): void {
  pressedOnButton = event.target instanceof Element && event.target.closest('button') !== null
}

function onHeadDragStart(event: DragEvent): void {
  if (pressedOnButton) {
    event.preventDefault()
    return
  }
  drag.startGroup(event, props.entry.group)
}

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
    <header
      class="panel__head"
      :class="{ 'is-draggable': draggable }"
      :draggable="draggable ? 'true' : undefined"
      @pointerdown="onHeadPointerDown"
      @dragstart="onHeadDragStart"
      @dragend="drag.end()"
    >
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
          :active="activeBookmark?.id === bookmark.id"
          :drag="
            draggable
              ? {
                  onStart: (event: DragEvent) => drag.startBookmark(event, bookmark),
                  onEnd: drag.end,
                }
              : undefined
          "
          @edit="actions.edit(bookmark)"
          @remove="onCardRemove(bookmark)"
          @move="actions.move(bookmark, $event)"
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

/* 整条标题栏就是分组的拖拽把手；按钮上保持 base.css 的 pointer */
.panel__head.is-draggable {
  cursor: grab;
}

.panel__head.is-draggable:active {
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

  .panel {
    padding: 11px;
  }
}
</style>
