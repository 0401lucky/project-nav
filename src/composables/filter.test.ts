import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { filterBookmarks, rangesOf, splitByHighlights } from './filter.ts'
import type { Bookmark, Group } from '../types.ts'

const groups: Group[] = [
  { id: 'g1', name: '开发工具', icon: '🛠️', sortOrder: 1024 },
  { id: 'g2', name: 'Reading', icon: null, sortOrder: 2048 },
]

function bookmark(over: Partial<Bookmark> & { id: string }): Bookmark {
  return {
    groupId: 'g1',
    title: '标题',
    url: 'https://example.com',
    description: null,
    hasIcon: false,
    sortOrder: 1024,
    updatedAt: 1,
    ...over,
  }
}

const bookmarks: Bookmark[] = [
  bookmark({ id: 'a', title: 'GitHub', url: 'https://github.com', description: '代码托管' }),
  bookmark({ id: 'b', title: 'Vue.js', url: 'https://vuejs.org', description: null, groupId: 'g2' }),
  bookmark({ id: 'c', title: 'MDN Web Docs', url: 'https://developer.mozilla.org', description: 'Web 标准' }),
]

describe('rangesOf', () => {
  it('找出所有出现位置', () => {
    assert.deepEqual(rangesOf('abcabc', 'abc'), [
      [0, 3],
      [3, 6],
    ])
  })

  it('大小写不敏感，但区间对的是原文位置', () => {
    assert.deepEqual(rangesOf('Hello World', 'world'), [[6, 11]])
    assert.deepEqual(rangesOf('GitHub', 'git'), [[0, 3]])
  })

  it('空串或没命中返回空数组', () => {
    assert.deepEqual(rangesOf('abc', ''), [])
    assert.deepEqual(rangesOf('abc', 'z'), [])
    assert.deepEqual(rangesOf('', 'a'), [])
  })

  it('正则元字符被当普通字符处理', () => {
    assert.deepEqual(rangesOf('a.b.c', '.'), [
      [1, 2],
      [3, 4],
    ])
    assert.deepEqual(rangesOf('f(x)', '(x)'), [[1, 4]])
  })
})

describe('filterBookmarks', () => {
  it('查询为空时不过滤', () => {
    const result = filterBookmarks(bookmarks, groups, '   ')
    assert.equal(result.visibleIds, null)
    assert.equal(result.noMatches, false)
    assert.equal(result.highlights.size, 0)
  })

  it('按标题匹配', () => {
    const result = filterBookmarks(bookmarks, groups, 'vue')
    assert.deepEqual([...(result.visibleIds ?? [])], ['b'])
    assert.equal(result.noMatches, false)
  })

  it('按网址匹配', () => {
    const result = filterBookmarks(bookmarks, groups, 'mozilla')
    assert.deepEqual([...(result.visibleIds ?? [])], ['c'])
  })

  it('按描述匹配', () => {
    const result = filterBookmarks(bookmarks, groups, '代码托管')
    assert.deepEqual([...(result.visibleIds ?? [])], ['a'])
  })

  it('按所属分组名匹配', () => {
    const result = filterBookmarks(bookmarks, groups, 'reading')
    assert.deepEqual([...(result.visibleIds ?? [])], ['b'], 'b 属于 Reading 分组')
  })

  it('一条都没匹配上时保持全量并置 noMatches', () => {
    const result = filterBookmarks(bookmarks, groups, 'zzzz')
    assert.equal(result.visibleIds, null, 'design §6：没匹配上时首页保持全量')
    assert.equal(result.noMatches, true)
    assert.equal(result.highlights.size, 0)
  })

  it('只给标题命中的书签标黄', () => {
    // 命中在分组名上，标题里没有，就不该有高亮
    const result = filterBookmarks(bookmarks, groups, '开发工具')
    assert.deepEqual([...(result.visibleIds ?? [])], ['a', 'c'])
    assert.equal(result.highlights.has('a'), false)
  })

  it('标题命中时给出区间', () => {
    const result = filterBookmarks(bookmarks, groups, 'web')
    assert.deepEqual(result.highlights.get('c'), [[4, 7]], 'MDN Web Docs 里的 Web')
  })

  it('查询串首尾空白被忽略', () => {
    const result = filterBookmarks(bookmarks, groups, '  vue  ')
    assert.deepEqual([...(result.visibleIds ?? [])], ['b'])
  })
})

describe('splitByHighlights', () => {
  it('没有区间时原样返回', () => {
    assert.deepEqual(splitByHighlights('abc', []), [{ text: 'abc', hit: false }])
  })

  it('把标题切成普通与高亮交替的片段', () => {
    assert.deepEqual(splitByHighlights('MDN Web Docs', [[4, 7]]), [
      { text: 'MDN ', hit: false },
      { text: 'Web', hit: true },
      { text: ' Docs', hit: false },
    ])
  })

  it('开头与结尾命中时不产生空片段', () => {
    assert.deepEqual(splitByHighlights('abc', [[0, 3]]), [{ text: 'abc', hit: true }])
    assert.deepEqual(splitByHighlights('abc', [[0, 1]]), [
      { text: 'a', hit: true },
      { text: 'bc', hit: false },
    ])
  })

  it('多个区间按顺序切开', () => {
    assert.deepEqual(splitByHighlights('aXbXc', [
      [1, 2],
      [3, 4],
    ]), [
      { text: 'a', hit: false },
      { text: 'X', hit: true },
      { text: 'b', hit: false },
      { text: 'X', hit: true },
      { text: 'c', hit: false },
    ])
  })

  it('重叠或乱序的区间不会切坏文本', () => {
    const parts = splitByHighlights('abcdef', [
      [3, 5],
      [1, 3],
      [2, 4],
    ])
    assert.equal(
      parts.map((part) => part.text).join(''),
      'abcdef',
      '拼回来必须还是原文',
    )
  })
})
