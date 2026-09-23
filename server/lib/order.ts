// sort_order 的取值规则，全站唯一定义处。
//
// 用间隔 1024 的整数而不是 0/1/2：留出空隙，将来若要"插入到两项之间"
// 可以直接取中值，不必整组重编号。当前所有排序入口都是整组重编号，
// 因此这里只需要"追加到末尾"和"按位置取值"两种。

/** 排序间隔 */
export const SORT_STEP = 1024

/** 追加到末尾时的 sort_order */
export function appendSortOrder(lastSortOrder: number | null): number {
  return (lastSortOrder ?? 0) + SORT_STEP
}

/** 第 index 个位置的 sort_order，从 0 开始 */
export function sortOrderAt(index: number): number {
  return (index + 1) * SORT_STEP
}

/** 按给定顺序展开成待写库的 (id, sortOrder) 列表 */
export function plannedOrders(ids: readonly string[]): { id: string; sortOrder: number }[] {
  return ids.map((id, index) => ({ id, sortOrder: sortOrderAt(index) }))
}
