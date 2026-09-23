// 分组与书签的全量数据。首页只拉一次 /api/bootstrap，之后所有改动都在这里改。

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Bookmark, BootstrapResponse, Group } from '@/types'

export interface GroupWithBookmarks {
  group: Group
  bookmarks: Bookmark[]
}

export const useDataStore = defineStore('data', () => {
  const groups = ref<Group[]>([])
  const bookmarks = ref<Bookmark[]>([])
  const loaded = ref(false)

  /** 按分组分区，组内保持 sortOrder 顺序；空分组也保留，否则新建分组看不见 */
  const byGroup = computed<GroupWithBookmarks[]>(() => {
    const buckets = new Map<string, Bookmark[]>()
    for (const bookmark of bookmarks.value) {
      const bucket = buckets.get(bookmark.groupId)
      if (bucket === undefined) buckets.set(bookmark.groupId, [bookmark])
      else bucket.push(bookmark)
    }
    return groups.value.map((group) => ({
      group,
      bookmarks: buckets.get(group.id) ?? [],
    }))
  })

  const isEmpty = computed(() => groups.value.length === 0)

  const total = computed(() => bookmarks.value.length)

  function applyBootstrap(payload: BootstrapResponse): void {
    groups.value = payload.groups
    bookmarks.value = payload.bookmarks
    loaded.value = true
  }

  function reset(): void {
    groups.value = []
    bookmarks.value = []
    loaded.value = false
  }

  return { groups, bookmarks, loaded, byGroup, isEmpty, total, applyBootstrap, reset }
})
