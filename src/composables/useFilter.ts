// 搜索状态与过滤结果。
//
// 查询串放在模块级共享：只有搜索框和首页网格两处用它，
// design 只规划了 auth / data / settings 三个 store，不值得为此加第四个。

import { computed, ref, watch } from 'vue'
import { filterBookmarks, stepIndex } from '@/composables/filter'
import { useDataStore } from '@/stores/data'
import type { GroupWithBookmarks } from '@/stores/data'
import type { Bookmark } from '@/types'

const query = ref('')

/** 搜索结果里 ↑↓ 选中的是第几条（按显示顺序） */
const activeIndex = ref(0)

// 换了搜索词，结果整个变了，旧下标没有意义
watch(query, () => {
  activeIndex.value = 0
})

export function useFilter() {
  const data = useDataStore()

  const result = computed(() => filterBookmarks(data.bookmarks, data.groups, query.value))

  const visibleByGroup = computed<GroupWithBookmarks[]>(() => {
    const ids = result.value.visibleIds
    if (ids === null) return data.byGroup
    return (
      data.byGroup
        .map((entry) => ({
          group: entry.group,
          bookmarks: entry.bookmarks.filter((bookmark) => ids.has(bookmark.id)),
        }))
        // 过滤时收起没命中的分组；不过滤时空分组要留着，否则新建的分组看不见
        .filter((entry) => entry.bookmarks.length > 0)
    )
  })

  const totalVisible = computed(() =>
    visibleByGroup.value.reduce((sum, entry) => sum + entry.bookmarks.length, 0),
  )

  /** 按显示顺序展平，↑↓ 就在这个次序上走 */
  const visibleList = computed<Bookmark[]>(() =>
    visibleByGroup.value.flatMap((entry) => entry.bookmarks),
  )

  /**
   * 回车要打开的那条。只在「有匹配」时存在：
   * 没匹配上时首页按 design §6 保持全量，那时的第一条跟搜索词无关。
   */
  const activeBookmark = computed<Bookmark | null>(() => {
    if (result.value.visibleIds === null) return null
    const list = visibleList.value
    // 结果变少（比如搜索中删掉了一条）时旧下标可能越界，夹回最后一条
    return list[Math.min(activeIndex.value, list.length - 1)] ?? null
  })

  function moveActive(delta: number): void {
    activeIndex.value = stepIndex(activeIndex.value, delta, visibleList.value.length)
  }

  function clear(): void {
    query.value = ''
  }

  return { query, result, visibleByGroup, totalVisible, activeBookmark, moveActive, clear }
}
