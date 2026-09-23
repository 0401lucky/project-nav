import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { appendSortOrder, plannedOrders, SORT_STEP, sortOrderAt } from '../lib/order.ts'

describe('排序取值规则', () => {
  it('追加到末尾时在上一个基础上加一个间隔', () => {
    assert.equal(appendSortOrder(null), SORT_STEP, '空表追加得到第一个间隔')
    assert.equal(appendSortOrder(SORT_STEP), SORT_STEP * 2)
    assert.equal(appendSortOrder(SORT_STEP * 7), SORT_STEP * 8)
  })

  it('按位置取值从第一个间隔开始', () => {
    assert.equal(sortOrderAt(0), SORT_STEP)
    assert.equal(sortOrderAt(2), SORT_STEP * 3)
  })

  it('间隔留出了取中值的空间', () => {
    // 将来若要"插到第 1 和第 2 项之间"，可以直接取中值而不用整组重编号
    const middle = (sortOrderAt(0) + sortOrderAt(1)) / 2
    assert.ok(middle > sortOrderAt(0) && middle < sortOrderAt(1))
  })

  it('按顺序展开成待写库的列表', () => {
    assert.deepEqual(plannedOrders(['a', 'b', 'c']), [
      { id: 'a', sortOrder: SORT_STEP },
      { id: 'b', sortOrder: SORT_STEP * 2 },
      { id: 'c', sortOrder: SORT_STEP * 3 },
    ])
    assert.deepEqual(plannedOrders([]), [])
  })
})
