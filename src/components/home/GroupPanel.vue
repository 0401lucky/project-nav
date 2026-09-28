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

      <!-- 桌面端悬停或键盘聚焦进来才出现，窄屏常显 -->
      <span class="panel__tools">
        <button
          class="panel__tool"
          type="button"
          aria-label="添加"
          title="添加书签到这个分组"
          @click="actions.addBookmark(entry.group)"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
        <button
          class="panel__tool"
          type="button"
          aria-label="编辑"
          title="编辑分组"
          @click="actions.editGroup(entry.group)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 20h4L19 9l-4-4L4 16v4Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" />
          </svg>
        </button>
      </span>
    </header>

    <p v-if="entry.bookmarks.length === 0" class="panel__empty">拖动书签到这里，或点 +</p>

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
/*
  分组不再有自己的底色和模糊：整块启动器面板只有一层 backdrop-filter。
  保留 1px 透明边框，拖到分组末尾时变成强调色，作为落点反馈。
*/
.panel {
  border: 1px solid transparent;
  border-radius: var(--r-card);
  transition: border-color var(--dur) var(--ease);
}

.panel.is-dragging-over {
  border-color: var(--accent);
}

.panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 26px;
  padding: 0 6px;
}

/* 整条标题栏就是分组的拖拽把手；按钮上保持 base.css 的 pointer */
.panel__head.is-draggable {
  cursor: grab;
}

.panel__head.is-draggable:active {
  cursor: grabbing;
}

.panel__icon {
  font-size: 13px;
  line-height: 1;
}

.panel__name {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel__count {
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

/* 顶到右边；用透明度隐藏而不是 display: none，显隐时标题栏不跳 */
.panel__tools {
  display: flex;
  gap: 2px;
  margin-left: auto;
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
}

.panel:hover .panel__tools,
.panel:focus-within .panel__tools {
  opacity: 1;
}

.panel__tool {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  color: var(--text-3);
  border-radius: 7px;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}

.panel__tool:hover {
  background: rgb(255 255 255 / 0.12);
  color: var(--text);
}

.panel__empty {
  padding: 6px 6px 4px;
  font-size: 12px;
  color: var(--text-3);
}

/* 桌面端是一行一条的竖排列表 */
.panel__grid {
  display: grid;
  gap: 1px;
}

.panel__cell {
  position: relative;
  min-width: 0;
}

/* 落点指示线：列表是竖排的，所以是贴在目标项上沿的一条横线 */
.panel__cell.is-drop-before::before {
  content: '';
  position: absolute;
  top: -1px;
  left: 4px;
  right: 4px;
  height: 2px;
  border-radius: 2px;
  background: var(--accent);
}

@media (max-width: 640px) {
  /* 小屏固定 3 列竖排卡片 */
  .panel__grid {
    grid-template-columns: repeat(3, 1fr);
  }

  /* 触屏没有悬停，工具按钮常显 */
  .panel__tools {
    opacity: 1;
  }
}
</style>
