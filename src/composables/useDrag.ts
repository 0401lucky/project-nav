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
import { dropIndexFor, planDrop } from './drag'

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
    // 不拦住的话会冒泡到分组面板的 overGroupBody，落点被改写成「末尾」
    event.stopPropagation()
    const rect = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect()
    if (rect === undefined) return
    // 卡片是横排网格，按左右半边判断前后
    target.value = { groupId, index: dropIndexFor(rect.left, rect.width, event.clientX, index) }
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
    target.value = {
      groupId: '__groups__',
      index: dropIndexFor(rect.top, rect.height, event.clientY, index),
    }
  }

  // drop 会从书签格子一路冒泡到分组格子，两个 drop 处理器都会被调用。
  // 必须先认领类型再清状态：若不是自己的拖拽就原样放过，留给外层处理。

  async function dropBookmark(): Promise<void> {
    const source = dragging.value
    const drop = target.value
    if (source?.kind !== 'bookmark') return
    dragging.value = null
    target.value = null
    if (drop === null) return

    const group = data.byGroup.find((entry) => entry.group.id === drop.groupId)
    if (group === undefined) return

    const next = planDrop(
      group.bookmarks.map((item) => item.id),
      source.id,
      drop.index,
    )
    if (next === null) return // 落回原位，不必打扰服务端
    // 跨组时 next 里含移入项，服务端会把它的 groupId 一起改掉
    await data.applyBookmarkOrder(drop.groupId, next)
  }

  async function dropGroup(): Promise<void> {
    const source = dragging.value
    const drop = target.value
    if (source?.kind !== 'group') return
    dragging.value = null
    target.value = null
    if (drop === null) return

    const next = planDrop(
      data.groups.map((group) => group.id),
      source.id,
      drop.index,
    )
    if (next === null) return
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

  /** 拖到分组末尾（空白处，或最后一项的后半边）时高亮整块面板 */
  function isDropAtEnd(groupId: string, count: number): boolean {
    const drop = target.value
    return (
      drop !== null &&
      drop.groupId === groupId &&
      (drop.index === -1 || drop.index >= count) &&
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
