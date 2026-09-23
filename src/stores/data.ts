// 分组与书签的全量数据。首页只拉一次 /api/bootstrap，之后所有改动都在这里改。
//
// 写操作一律乐观更新：先改本地再发请求，失败回滚并弹提示（design §9）。
// 注意展示顺序完全由 bookmarks 数组的次序决定（byGroup 只做分区、不重排），
// 所以本地重排只要重排数组，不需要在客户端复刻服务端的 sort_order 计算规则。

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { UnauthorizedError, api, describeError } from '@/api/client'
import type { BookmarkInput, BookmarkPatch, GroupInput } from '@/api/client'
import { applyOrderWithin, moveToGroupEnd, placeUpdated } from '@/composables/drag'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import type { Bookmark, BootstrapResponse, Group } from '@/types'

export interface GroupWithBookmarks {
  group: Group
  bookmarks: Bookmark[]
}

interface Snapshot {
  groups: Group[]
  bookmarks: Bookmark[]
}

export const useDataStore = defineStore('data', () => {
  const groups = ref<Group[]>([])
  const bookmarks = ref<Bookmark[]>([])
  const loaded = ref(false)

  const toast = useToast()

  /** 按分组分区，保持数组原有次序；空分组也保留，否则新建分组看不见 */
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

  function snapshot(): Snapshot {
    return { groups: [...groups.value], bookmarks: [...bookmarks.value] }
  }

  function restore(snap: Snapshot): void {
    groups.value = snap.groups
    bookmarks.value = snap.bookmarks
  }

  /** 失败时统一收尾：回滚 + 提示 + 会话失效就整站退回登录屏 */
  function handleFailure(error: unknown, snap: Snapshot): void {
    restore(snap)
    if (error instanceof UnauthorizedError) useAuthStore().markUnauthorized()
    toast.error(describeError(error))
  }

  function groupIdsInOrder(): string[] {
    return groups.value.map((group) => group.id)
  }

  // ---------------- 分组 ----------------

  async function createGroup(input: GroupInput): Promise<Group | null> {
    const snap = snapshot()
    try {
      const created = await api.createGroup(input)
      groups.value = [...groups.value, created]
      return created
    } catch (error) {
      handleFailure(error, snap)
      return null
    }
  }

  async function updateGroup(id: string, patch: Partial<GroupInput>): Promise<boolean> {
    const snap = snapshot()
    const current = groups.value.find((group) => group.id === id)
    if (current === undefined) return false

    groups.value = groups.value.map((group) =>
      group.id === id
        ? {
            ...group,
            name: patch.name ?? group.name,
            icon: patch.icon === undefined ? group.icon : patch.icon,
          }
        : group,
    )

    try {
      const updated = await api.updateGroup(id, patch)
      // 以服务端返回为准，避免本地推断和真实结果有偏差
      groups.value = groups.value.map((group) => (group.id === id ? updated : group))
      return true
    } catch (error) {
      handleFailure(error, snap)
      return false
    }
  }

  async function removeGroup(id: string, moveTo?: string): Promise<boolean> {
    const snap = snapshot()

    // 乐观地先把组内书签迁到目标组末尾，再移除该组
    if (moveTo === undefined) {
      bookmarks.value = bookmarks.value.filter((item) => item.groupId !== id)
    } else {
      let next = bookmarks.value
      for (const bookmark of bookmarks.value.filter((item) => item.groupId === id)) {
        next = moveToGroupEnd(next, { ...bookmark, groupId: moveTo })
      }
      bookmarks.value = next
    }
    groups.value = groups.value.filter((group) => group.id !== id)

    try {
      await api.deleteGroup(id, moveTo)
      return true
    } catch (error) {
      handleFailure(error, snap)
      return false
    }
  }

  async function applyGroupOrder(ids: string[]): Promise<boolean> {
    if (ids.length !== groups.value.length) return false
    const snap = snapshot()

    const byId = new Map(groups.value.map((group) => [group.id, group]))
    groups.value = ids.flatMap((id) => {
      const group = byId.get(id)
      return group === undefined ? [] : [group]
    })

    try {
      await api.orderGroups(ids)
      return true
    } catch (error) {
      handleFailure(error, snap)
      return false
    }
  }

  // ---------------- 书签 ----------------

  async function createBookmark(input: BookmarkInput): Promise<Bookmark | null> {
    const snap = snapshot()
    try {
      const created = await api.createBookmark(input)
      // 服务端把它追加在所属分组末尾，全局数组尾部插入能保持组内相对顺序
      bookmarks.value = [...bookmarks.value, created]
      return created
    } catch (error) {
      handleFailure(error, snap)
      return null
    }
  }

  async function updateBookmark(id: string, patch: BookmarkPatch): Promise<boolean> {
    const snap = snapshot()
    const current = bookmarks.value.find((item) => item.id === id)
    if (current === undefined) return false

    const optimistic: Bookmark = {
      ...current,
      title: patch.title ?? current.title,
      url: patch.url ?? current.url,
      description: patch.description === undefined ? current.description : patch.description,
      groupId: patch.groupId ?? current.groupId,
      updatedAt: Date.now(),
    }
    bookmarks.value = placeUpdated(bookmarks.value, optimistic)

    try {
      const updated = await api.updateBookmark(id, patch)
      bookmarks.value = placeUpdated(bookmarks.value, updated)
      return true
    } catch (error) {
      handleFailure(error, snap)
      return false
    }
  }

  async function removeBookmark(id: string): Promise<boolean> {
    const snap = snapshot()
    bookmarks.value = bookmarks.value.filter((item) => item.id !== id)

    try {
      await api.deleteBookmark(id)
      return true
    } catch (error) {
      handleFailure(error, snap)
      return false
    }
  }

  /** 组内重排，以及把别组的书签移进来（ids 里含移入项） */
  async function applyBookmarkOrder(groupId: string, ids: string[]): Promise<boolean> {
    const snap = snapshot()
    bookmarks.value = applyOrderWithin(bookmarks.value, groupId, ids)

    try {
      await api.orderBookmarks(groupId, ids)
      return true
    } catch (error) {
      handleFailure(error, snap)
      return false
    }
  }

  return {
    groups,
    bookmarks,
    loaded,
    byGroup,
    isEmpty,
    total,
    applyBootstrap,
    reset,
    createGroup,
    updateGroup,
    removeGroup,
    applyGroupOrder,
    createBookmark,
    updateBookmark,
    removeBookmark,
    applyBookmarkOrder,
    groupIdsInOrder,
  }
})
