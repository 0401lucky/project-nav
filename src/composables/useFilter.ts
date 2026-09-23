// 搜索状态与过滤结果。
//
// 查询串放在模块级共享：只有搜索框和首页网格两处用它，
// design 只规划了 auth / data / settings 三个 store，不值得为此加第四个。

import { computed, ref } from 'vue'
import { filterBookmarks } from '@/composables/filter'
import { useDataStore } from '@/stores/data'
import type { GroupWithBookmarks } from '@/stores/data'
import type { Bookmark } from '@/types'

const query = ref('')

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

  /** 显示顺序里的第一条，回车打开它 */
  const firstVisible = computed<Bookmark | null>(
    () => visibleByGroup.value[0]?.bookmarks[0] ?? null,
  )

  function clear(): void {
    query.value = ''
  }

  return { query, result, visibleByGroup, totalVisible, firstVisible, clear }
}
