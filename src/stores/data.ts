// 分组与书签的全量数据。首页只拉一次 /api/bootstrap，之后所有改动都在这里改。
//
// 写操作一律乐观更新：先改本地再发请求，失败回滚并弹提示（design §9）。
// 注意展示顺序完全由 bookmarks 数组的次序决定（byGroup 只做分区、不重排），
// 所以本地重排只要重排数组，不需要在客户端复刻服务端的 sort_order 计算规则。

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ApiError, UnauthorizedError, api, describeError } from '@/api/client'
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

/** 删除后可撤销的时长；撤销提示也显示这么久 */
const UNDO_MS = 5000

/** 已从界面上拿掉、还没提交给服务端的删除 */
interface PendingDelete {
  bookmark: Bookmark
  /** 同组里原本排在它后面的那条，撤销时插回它前面；它是组内最后一条时为 null */
  nextId: string | null
  timer: ReturnType<typeof setTimeout>
  /** 提交后撤销已无意义，要把那条带「撤销」的提示一起收掉 */
  toastId: number
}

export const useDataStore = defineStore('data', () => {
  const groups = ref<Group[]>([])
  const bookmarks = ref<Bookmark[]>([])
  const loaded = ref(false)

  /** 不放进响应式：界面只关心书签在不在数组里，不需要看这张表 */
  const pending = new Map<string, PendingDelete>()
  /** 已发出、还没回来的删除请求 */
  const inflight = new Set<Promise<void>>()

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
    // 调用方（退出登录）会先 flushPendingDeletes；走到这里还剩的只能丢弃，等于没删
    for (const entry of pending.values()) {
      clearTimeout(entry.timer)
      toast.dismiss(entry.toastId)
    }
    pending.clear()
    groups.value = []
    bookmarks.value = []
    loaded.value = false
  }

  function snapshot(): Snapshot {
    return { groups: [...groups.value], bookmarks: [...bookmarks.value] }
  }

  function restore(snap: Snapshot): void {
    groups.value = snap.groups
    // 快照可能早于某次删除：待删除项不能跟着回滚复活，否则提交后界面上还留着它
    bookmarks.value = snap.bookmarks.filter((item) => !pending.has(item.id))
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
    // 待删除项可能在这个组里：先提交掉，免得撤销时组已经没了
    await flushPendingDeletes()
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
      if (typeof input.iconUrl === 'string') void waitForIcon(created.id)
      return created
    } catch (error) {
      handleFailure(error, snap)
      return null
    }
  }

  /** 只换一条书签的内容，不动位置；图标状态变化走这里 */
  function replaceBookmark(next: Bookmark): void {
    bookmarks.value = bookmarks.value.map((item) => (item.id === next.id ? next : item))
  }

  /**
   * 图标在服务端后台下载，接口不会通知完成。
   * 隔 2s、4s、8s 各查一次，拿到就换上；都没拿到就保持首字色块，不打扰用户。
   */
  async function waitForIcon(id: string): Promise<void> {
    for (const delay of [2000, 4000, 8000]) {
      await new Promise((resolve) => setTimeout(resolve, delay))
      if (!bookmarks.value.some((item) => item.id === id)) return
      try {
        const latest = await api.getBookmark(id)
        if (latest.hasIcon) {
          replaceBookmark(latest)
          return
        }
      } catch {
        return
      }
    }
  }

  /** 补抓之后整体刷新书签列表：成功的那些图标状态都变了 */
  async function reloadBookmarks(): Promise<void> {
    // 不先提交的话，拉回来的列表里还有待删除项，它会重新出现在界面上
    await flushPendingDeletes()
    const payload = await api.bootstrap()
    bookmarks.value = payload.bookmarks
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

  /**
   * 删除先只在界面上拿掉，UNDO_MS 之后才真正调接口，期间可以撤销。
   * 关掉页面等于没删（prd 接受）。
   */
  function removeBookmark(id: string): void {
    const bookmark = bookmarks.value.find((item) => item.id === id)
    if (bookmark === undefined || pending.has(id)) return

    const sameGroup = bookmarks.value.filter((item) => item.groupId === bookmark.groupId)
    const nextId = sameGroup[sameGroup.findIndex((item) => item.id === id) + 1]?.id ?? null
    bookmarks.value = bookmarks.value.filter((item) => item.id !== id)

    pending.set(id, {
      bookmark,
      nextId,
      timer: setTimeout(() => commitDelete(id), UNDO_MS),
      toastId: toast.action(`已删除「${bookmark.title}」`, '撤销', () => undoRemove(id), UNDO_MS),
    })
  }

  function undoRemove(id: string): void {
    const entry = pending.get(id)
    if (entry === undefined) return // 已经提交了，撤销不了
    clearTimeout(entry.timer)
    pending.delete(id)
    reinsert(entry)
  }

  /**
   * 放回原位：插到「原来的后一条」前面，它也不在了就放到组末尾。
   * 不用 snapshot/restore：几秒后整表换回去，会把这期间别的改动一起吞掉。
   */
  function reinsert(entry: PendingDelete): void {
    const { bookmark, nextId } = entry
    // 所在分组已经没了就放弃，插回去也是一张孤儿卡片
    if (!groups.value.some((group) => group.id === bookmark.groupId)) return
    // 提交失败前若已被别的途径放回（比如整表重新拉取），再插一次会出现重复 id
    if (bookmarks.value.some((item) => item.id === bookmark.id)) return

    const anchor = bookmarks.value.findIndex(
      (item) => item.id === nextId && item.groupId === bookmark.groupId,
    )
    if (anchor === -1) {
      bookmarks.value = moveToGroupEnd(bookmarks.value, bookmark)
      return
    }
    const next = [...bookmarks.value]
    next.splice(anchor, 0, bookmark)
    bookmarks.value = next
  }

  function commitDelete(id: string): void {
    const entry = pending.get(id)
    if (entry === undefined) return
    clearTimeout(entry.timer)
    pending.delete(id)
    toast.dismiss(entry.toastId)

    const request = submitDelete(entry)
    inflight.add(request)
    void request.finally(() => inflight.delete(request))
  }

  /** 不会 reject：失败在这里就地处理完 */
  async function submitDelete(entry: PendingDelete): Promise<void> {
    try {
      await api.deleteBookmark(entry.bookmark.id)
    } catch (error) {
      // 404：服务端已经没有它了（比如被别处删掉），目的已经达到
      if (error instanceof ApiError && error.status === 404) return
      reinsert(entry)
      if (error instanceof UnauthorizedError) useAuthStore().markUnauthorized()
      toast.error(describeError(error))
    }
  }

  /**
   * 立刻提交全部待删除项，并等所有删除请求落地。
   * 重排、删分组、重新拉取、退出登录之前都要先调它：
   * 重排接口要求提交的 id 与服务端一致，而待删除项在服务端还在。
   * 定时器刚触发、请求还在路上的那些也要等——它们已不在 pending 里了。
   */
  async function flushPendingDeletes(): Promise<void> {
    for (const id of [...pending.keys()]) commitDelete(id)
    await Promise.all([...inflight])
  }

  /** 组内重排，以及把别组的书签移进来（ids 里含移入项） */
  async function applyBookmarkOrder(groupId: string, ids: string[]): Promise<boolean> {
    await flushPendingDeletes()
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
    replaceBookmark,
    reloadBookmarks,
    updateBookmark,
    removeBookmark,
    undoRemove,
    flushPendingDeletes,
    applyBookmarkOrder,
    groupIdsInOrder,
  }
})
