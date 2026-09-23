// 原生 HTML5 拖拽的接线。不引拖拽库（prd 明确不引），靠 dragstart/dragover/drop。
//
// 为什么不在 dragover 期间就重排 store：
// 一是原生 DnD 期间重排 DOM 会让浏览器自带的拖影抖动；
// 二是那样得额外保存一份「拖前顺序」才能正确回滚。
// 落在 drop 时再乐观重排，store 的失败回滚目标天然就是拖前状态，
// 不需要第二套回滚机制。拖拽过程中用落点指示线给反馈。

import { computed, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import type { Bookmark, Group } from '@/types'
import { dropIndexFor } from './drag'

type DragKind = 'bookmark' | 'group'

interface DragState {
  kind: DragKind
  id: string
}

/** 落点在哪个分组、哪个下标；-1 表示放在该分组末尾 */
interface DropTarget {
  groupId: string
  index: number
}

export function useDrag() {
  const data = useDataStore()

  const dragging = ref<DragState | null>(null)
  const target = ref<DropTarget | null>(null)
  /** 拖拽是鼠标专属操作，触屏上藏起手柄（implement.md 9.1） */
  const enabled = ref(true)

  const isDraggingBookmark = computed(() => dragging.value?.kind === 'bookmark')
  const isDraggingGroup = computed(() => dragging.value?.kind === 'group')

  function startBookmark(event: DragEvent, bookmark: Bookmark): void {
    if (!enabled.value) return
    dragging.value = { kind: 'bookmark', id: bookmark.id }
    target.value = null
    // 要让拖拽生效必须 setData，值本身不用
    event.dataTransfer?.setData('text/plain', bookmark.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  function startGroup(event: DragEvent, group: Group): void {
    if (!enabled.value) return
    dragging.value = { kind: 'group', id: group.id }
    target.value = null
    event.dataTransfer?.setData('text/plain', group.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  function overBookmark(event: DragEvent, groupId: string, index: number): void {
    if (!isDraggingBookmark.value) return
    const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()
    if (rect === undefined) return
    target.value = { groupId, index: dropIndexFor(rect, event.clientY, index) }
  }

  /** 指针落在分组面板空白处：放到该分组末尾 */
  function overGroupBody(groupId: string): void {
    if (!isDraggingBookmark.value) return
    target.value = { groupId, index: -1 }
  }

  function overGroup(event: DragEvent, index: number): void {
    if (!isDraggingGroup.value) return
    const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()
    if (rect === undefined) return
    target.value = { groupId: '__groups__', index: dropIndexFor(rect, event.clientY, index) }
  }

  async function dropBookmark(): Promise<void> {
    const source = dragging.value
    const drop = target.value
    dragging.value = null
    target.value = null
    if (source === null || drop === null || source.kind !== 'bookmark') return

    const group = data.byGroup.find((entry) => entry.group.id === drop.groupId)
    if (group === undefined) return

    const currentIds = group.bookmarks.map((item) => item.id)
    const originalIndex = currentIds.indexOf(source.id)
    // 目标分组的顺序先摘掉被拖的那条，再按落点插回去
    const baseIds = currentIds.filter((id) => id !== source.id)

    let insertAt = drop.index === -1 ? baseIds.length : drop.index
    // drop.index 是对「还含被拖项」的列表算出来的，摘掉之后同一锚点要前移一位
    if (originalIndex !== -1 && originalIndex < insertAt) insertAt -= 1
    insertAt = Math.max(0, Math.min(insertAt, baseIds.length))

    const next = [...baseIds]
    next.splice(insertAt, 0, source.id)

    if (currentIds.length === next.length && currentIds.every((id, index) => id === next[index])) {
      return // 落回原位，不必打扰服务端
    }

    if (originalIndex === -1) {
      // 跨组：服务端会把 groupId 一起改掉
      await data.moveBookmark(source.id, drop.groupId, insertAt)
      return
    }
    await data.applyBookmarkOrder(drop.groupId, next)
  }

  async function dropGroup(): Promise<void> {
    const source = dragging.value
    const drop = target.value
    dragging.value = null
    target.value = null
    if (source === null || drop === null || source.kind !== 'group') return

    const currentIds = data.groups.map((group) => group.id)
    const originalIndex = currentIds.indexOf(source.id)
    if (originalIndex === -1) return

    const baseIds = currentIds.filter((id) => id !== source.id)
    let insertAt = drop.index === -1 ? baseIds.length : drop.index
    if (originalIndex < insertAt) insertAt -= 1
    insertAt = Math.max(0, Math.min(insertAt, baseIds.length))

    const next = [...baseIds]
    next.splice(insertAt, 0, source.id)

    if (currentIds.length === next.length && currentIds.every((id, index) => id === next[index])) {
      return
    }
    await data.applyGroupOrder(next)
  }

  function end(): void {
    dragging.value = null
    target.value = null
  }

  /** 该分组内 index 位置是否要显示落点线 */
  function isDropBefore(groupId: string, index: number): boolean {
    const drop = target.value
    return drop !== null && drop.groupId === groupId && drop.index === index && isDraggingBookmark.value
  }

  /** 拖到分组末尾时，最后一项之后要不要显示落点线 */
  function isDropAtEnd(groupId: string, count: number): boolean {
    const drop = target.value
    return (
      drop !== null &&
      drop.groupId === groupId &&
      drop.index === -1 &&
      count > 0 &&
      isDraggingBookmark.value
    )
  }

  function isGroupDropBefore(index: number): boolean {
    const drop = target.value
    return (
      drop !== null && drop.groupId === '__groups__' && drop.index === index && isDraggingGroup.value
    )
  }

  return {
    dragging,
    enabled,
    isDraggingBookmark,
    isDraggingGroup,
    startBookmark,
    startGroup,
    overBookmark,
    overGroupBody,
    overGroup,
    dropBookmark,
    dropGroup,
    end,
    isDropBefore,
    isDropAtEnd,
    isGroupDropBefore,
  }
}

/** 拖拽控制器：首页里必须全局唯一，所以只在 App 建一次往下传 */
export type DragController = ReturnType<typeof useDrag>
