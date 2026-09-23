// 列表重排的纯逻辑，供拖拽使用。
// 与 filter.ts 同样的约束：零运行时 import，能被 node:test 直接跑。

/** 具备稳定标识的列表项 */
export interface Reorderable {
  id: string
}

/**
 * 把 fromId 移到 toIndex 位置，返回新数组。
 * 参数不合法（找不到 id、下标越界）时返回原顺序的副本，不抛错——
 * 拖拽过程中拿到脏位置的概率不低，宁可不动也不要打断用户。
 */
export function reorder<T extends Reorderable>(
  list: readonly T[],
  fromId: string,
  toIndex: number,
): T[] {
  const fromIndex = list.findIndex((item) => item.id === fromId)
  if (fromIndex === -1) return [...list]

  const target = clamp(toIndex, 0, list.length - 1)
  if (target === fromIndex) return [...list]

  const next = [...list]
  const [moved] = next.splice(fromIndex, 1)
  if (moved === undefined) return [...list]
  next.splice(target, 0, moved)
  return next
}

/**
 * 把 item 插到 list 的 index 位置（用于跨组拖入时构造新列表）。
 * 已存在同 id 的项会被先移除，避免重复。
 */
export function insertAt<T extends Reorderable>(list: readonly T[], item: T, index: number): T[] {
  const without = list.filter((entry) => entry.id !== item.id)
  const target = clamp(index, 0, without.length)
  const next = [...without]
  next.splice(target, 0, item)
  return next
}

/** 计算拖动元素应落在哪个下标：指针在目标元素上半部就插到它前面 */
export function dropIndexFor(
  rect: { top: number; height: number },
  pointerY: number,
  index: number,
): number {
  return pointerY < rect.top + rect.height / 2 ? index : index + 1
}

/** 既属于某个分组又能被重排的最小形状 */
export interface GroupedItem {
  id: string
  groupId: string
}

/**
 * 把 groupId 这一组重排成 ids 指定的顺序，其他分组的项排在前面且保持原相对顺序。
 *
 * ids 里可能包含原本不属于该分组的项（跨组移入）。这些项**必须**先从「其他分组」
 * 那部分里摘掉——移入项的 groupId 此刻还是旧分组，不摘就会出现同一项两处各一份，
 * 界面上表现为同一个书签在两个分组里同时显示。
 */
export function applyOrderWithin<T extends GroupedItem>(
  list: readonly T[],
  groupId: string,
  ids: readonly string[],
): T[] {
  const movingIds = new Set(ids)
  const others = list.filter((item) => item.groupId !== groupId && !movingIds.has(item.id))
  const byId = new Map(list.map((item) => [item.id, item]))

  const reordered = ids.flatMap((id) => {
    const item = byId.get(id)
    return item === undefined ? [] : [{ ...item, groupId }]
  })

  return [...others, ...reordered]
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.min(Math.max(value, min), max)
}
