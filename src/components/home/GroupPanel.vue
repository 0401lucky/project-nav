<script setup lang="ts">
import BookmarkCard from '@/components/home/BookmarkCard.vue'
import type { GroupWithBookmarks } from '@/stores/data'

defineProps<{ entry: GroupWithBookmarks }>()
</script>

<template>
  <section class="panel">
    <header class="panel__head">
      <span v-if="entry.group.icon" class="panel__icon" aria-hidden="true">{{ entry.group.icon }}</span>
      <h2 class="panel__name">{{ entry.group.name }}</h2>
      <span class="panel__count">{{ entry.bookmarks.length }}</span>
    </header>

    <p v-if="entry.bookmarks.length === 0" class="panel__empty">这个分组还没有书签</p>

    <ul v-else class="panel__grid">
      <li v-for="bookmark in entry.bookmarks" :key="bookmark.id">
        <BookmarkCard :bookmark="bookmark" />
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
}

.panel__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.panel__icon {
  font-size: 14px;
  line-height: 1;
}

.panel__name {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text);
}

.panel__count {
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.panel__empty {
  padding: 6px 2px 2px;
  font-size: 12px;
  color: var(--text-3);
}

.panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--gap);
}

.panel__grid > li {
  min-width: 0;
}
</style>
