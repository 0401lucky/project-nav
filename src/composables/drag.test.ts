import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyOrderWithin,
  dropIndexFor,
  insertAt,
  moveToGroupEnd,
  placeUpdated,
  planDrop,
  reorder,
} from './drag.ts'

interface Item {
  id: string
}

const list: Item[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
const ids = (items: readonly Item[]): string[] => items.map((item) => item.id)

describe('reorder', () => {
  it('往后挪', () => {
    assert.deepEqual(ids(reorder(list, 'a', 2)), ['b', 'c', 'a', 'd'])
  })

  it('往前挪', () => {
    assert.deepEqual(ids(reorder(list, 'd', 1)), ['a', 'd', 'b', 'c'])
  })

  it('挪到开头与末尾', () => {
    assert.deepEqual(ids(reorder(list, 'c', 0)), ['c', 'a', 'b', 'd'])
    assert.deepEqual(ids(reorder(list, 'a', 3)), ['b', 'c', 'd', 'a'])
  })

  it('原地不动时内容不变', () => {
    assert.deepEqual(ids(reorder(list, 'b', 1)), ['a', 'b', 'c', 'd'])
  })

  it('id 不存在时原样返回', () => {
    assert.deepEqual(ids(reorder(list, 'zzz', 0)), ['a', 'b', 'c', 'd'])
  })

  it('下标越界会被夹到有效范围，不抛错', () => {
    assert.deepEqual(ids(reorder(list, 'a', 99)), ['b', 'c', 'd', 'a'])
    assert.deepEqual(ids(reorder(list, 'd', -5)), ['d', 'a', 'b', 'c'])
    assert.deepEqual(ids(reorder(list, 'a', Number.NaN)), ['a', 'b', 'c', 'd'])
  })

  it('不修改传入的数组', () => {
    const original = [...list]
    reorder(list, 'a', 3)
    assert.deepEqual(ids(list), ids(original))
  })

  it('单项列表不出错', () => {
    assert.deepEqual(ids(reorder([{ id: 'x' }], 'x', 5)), ['x'])
    assert.deepEqual(ids(reorder([], 'x', 0)), [])
  })
})

describe('insertAt', () => {
  it('插到指定位置', () => {
    assert.deepEqual(ids(insertAt(list.slice(0, 2), { id: 'n' }, 1)), ['a', 'n', 'b'])
    assert.deepEqual(ids(insertAt(list.slice(0, 2), { id: 'n' }, 2)), ['a', 'b', 'n'])
    assert.deepEqual(ids(insertAt(list.slice(0, 2), { id: 'n' }, 0)), ['n', 'a', 'b'])
  })

  it('同 id 已存在时先移除再插入，不会出现两份', () => {
    assert.deepEqual(ids(insertAt(list, { id: 'b' }, 3)), ['a', 'c', 'd', 'b'])
  })

  it('空列表也能插入', () => {
    assert.deepEqual(ids(insertAt([], { id: 'n' }, 0)), ['n'])
  })
})

describe('dropIndexFor', () => {
  // 元素在该轴上从 100 开始、长 40
  it('指针落在前半段就插到该元素前面', () => {
    assert.equal(dropIndexFor(100, 40, 105, 2), 2)
  })

  it('指针落在后半段就插到该元素后面', () => {
    assert.equal(dropIndexFor(100, 40, 135, 2), 3)
  })

  it('正好在中线算后面', () => {
    assert.equal(dropIndexFor(100, 40, 120, 2), 3)
  })
})

describe('planDrop', () => {
  const group = ['a', 'b', 'c', 'd']

  it('组内往后拖：落在 c 前面', () => {
    assert.deepEqual(planDrop(group, 'a', 2), ['b', 'a', 'c', 'd'])
  })

  it('组内往前拖：落在 b 前面', () => {
    assert.deepEqual(planDrop(group, 'd', 1), ['a', 'd', 'b', 'c'])
  })

  it('组内拖到末尾（-1）就真的在末尾，不是倒数第二', () => {
    assert.deepEqual(planDrop(group, 'a', -1), ['b', 'c', 'd', 'a'])
  })

  it('组内落在最后一项之后（下标等于长度）也在末尾', () => {
    assert.deepEqual(planDrop(group, 'b', 4), ['a', 'c', 'd', 'b'])
  })

  it('跨组移入：插到指定位置', () => {
    assert.deepEqual(planDrop(group, 'x', 1), ['a', 'x', 'b', 'c', 'd'])
  })

  it('跨组移入末尾', () => {
    assert.deepEqual(planDrop(group, 'x', -1), ['a', 'b', 'c', 'd', 'x'])
  })

  it('跨组移入空分组', () => {
    assert.deepEqual(planDrop([], 'x', -1), ['x'])
  })

  it('落回原位返回 null', () => {
    assert.equal(planDrop(group, 'b', 1), null)
    assert.equal(planDrop(group, 'b', 2), null)
    assert.equal(planDrop(group, 'd', -1), null)
  })
})

describe('moveToGroupEnd / placeUpdated', () => {
  interface Grouped {
    id: string
    groupId: string
    title?: string
  }

  const list: Grouped[] = [
    { id: 'a', groupId: 'g1' },
    { id: 'b', groupId: 'g1' },
    { id: 'c', groupId: 'g1' },
    { id: 'x', groupId: 'g2' },
  ]

  const shape = (items: readonly Grouped[]): string[] =>
    items.map((item) => `${item.id}@${item.groupId}${item.title ? `:${item.title}` : ''}`)

  it('moveToGroupEnd 把项放到所属分组最后一条之后', () => {
    assert.deepEqual(shape(moveToGroupEnd(list, { id: 'x', groupId: 'g1' })), [
      'a@g1',
      'b@g1',
      'c@g1',
      'x@g1',
    ])
  })

  it('同组编辑原地替换，不挪到组末尾（服务端也不改 sort_order）', () => {
    assert.deepEqual(shape(placeUpdated(list, { id: 'a', groupId: 'g1', title: 'new' })), [
      'a@g1:new',
      'b@g1',
      'c@g1',
      'x@g2',
    ])
  })

  it('换了分组才追加到新分组末尾', () => {
    assert.deepEqual(shape(placeUpdated(list, { id: 'a', groupId: 'g2' })), [
      'b@g1',
      'c@g1',
      'x@g2',
      'a@g2',
    ])
  })
})

describe('applyOrderWithin', () => {
  interface Grouped {
    id: string
    groupId: string
  }

  const list: Grouped[] = [
    { id: 'a', groupId: 'g1' },
    { id: 'b', groupId: 'g1' },
    { id: 'x', groupId: 'g2' },
    { id: 'y', groupId: 'g2' },
  ]

  const shape = (items: readonly Grouped[]): string[] =>
    items.map((item) => `${item.id}@${item.groupId}`)

  it('组内重排：其他分组的项保持原相对顺序', () => {
    assert.deepEqual(shape(applyOrderWithin(list, 'g1', ['b', 'a'])), [
      'x@g2',
      'y@g2',
      'b@g1',
      'a@g1',
    ])
  })

  it('跨组移入时不会出现两份：移入项必须先从未分组部分摘掉', () => {
    // a 原本属于 g1，现在要移进 g2 —— 这是之前真实出过的 bug，
    // 结果里 a 会出现两次（一次留在 g1，一次作为 g2 成员）
    const result = applyOrderWithin(list, 'g2', ['x', 'y', 'a'])
    assert.deepEqual(shape(result), ['b@g1', 'x@g2', 'y@g2', 'a@g2'])
    assert.equal(result.filter((item) => item.id === 'a').length, 1, '同一项只能出现一次')
  })

  it('ids 里含不存在的 id 时跳过', () => {
    assert.deepEqual(shape(applyOrderWithin(list, 'g1', ['b', 'nope'])), ['x@g2', 'y@g2', 'b@g1'])
  })

  it('空 ids 表示该分组清空', () => {
    assert.deepEqual(shape(applyOrderWithin(list, 'g1', [])), ['x@g2', 'y@g2'])
  })
})
