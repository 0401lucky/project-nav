// 搜索匹配的纯逻辑。这个文件**不允许有任何运行时 import**：
// 它要能被 node:test 直接跑（design §11 的前端测试只测纯函数），
// 而 `@/` 这类打包器别名在 node 里解析不了，所以类型只能走无扩展名的相对路径。
// 类型导入会被类型擦除，运行时不存在解析问题。

import type { Bookmark, Group } from '../types'

/** 标题里命中片段的区间，半开区间 [start, end) */
export type HighlightRange = [start: number, end: number]

export interface FilterResult {
  /**
   * 应该展示的书签 id。null 表示不过滤——查询为空、或查询一条都没匹配上。
   * design §6：没匹配上时首页保持全量，只提示回车会用搜索引擎。
   */
  visibleIds: Set<string> | null
  /** 书签 id → 标题里要标黄的区间 */
  highlights: Map<string, HighlightRange[]>
  /** 查询非空但一条都没匹配上 */
  noMatches: boolean
}

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g

/**
 * 找出 needle 在 text 里出现的所有位置。
 * 用带 i 标志的正则而不是先 toLowerCase 再 indexOf：
 * 后者在少数语言里大小写转换会改变长度，区间就和原文对不上了。
 */
export function rangesOf(text: string, needle: string): HighlightRange[] {
  if (needle === '' || text === '') return []
  const pattern = new RegExp(needle.replace(REGEX_SPECIALS, '\\$&'), 'gi')
  const ranges: HighlightRange[] = []
  for (const match of text.matchAll(pattern)) {
    const start = match.index
    if (start === undefined) continue
    ranges.push([start, start + match[0].length])
  }
  return ranges
}

/**
 * 标题、网址、描述、所属分组名，任一字段包含查询串就算命中。
 * 高亮只作用于标题——卡片上只显示标题，标在别处用户看不到。
 */
export function filterBookmarks(
  bookmarks: readonly Bookmark[],
  groups: readonly Group[],
  rawQuery: string,
): FilterResult {
  const query = rawQuery.trim()
  if (query === '') {
    return { visibleIds: null, highlights: new Map(), noMatches: false }
  }

  const groupNameById = new Map(groups.map((group) => [group.id, group.name]))
  const needle = query.toLowerCase()
  const visibleIds = new Set<string>()
  const highlights = new Map<string, HighlightRange[]>()

  for (const bookmark of bookmarks) {
    const groupName = groupNameById.get(bookmark.groupId) ?? ''
    const haystack = `${bookmark.title}\n${bookmark.url}\n${bookmark.description ?? ''}\n${groupName}`.toLowerCase()
    if (!haystack.includes(needle)) continue

    visibleIds.add(bookmark.id)
    const ranges = rangesOf(bookmark.title, query)
    if (ranges.length > 0) highlights.set(bookmark.id, ranges)
  }

  if (visibleIds.size === 0) {
    return { visibleIds: null, highlights: new Map(), noMatches: true }
  }
  return { visibleIds, highlights, noMatches: false }
}

/** 把标题按命中区间切成「普通 / 高亮」交替的片段，供模板直接渲染 */
export function splitByHighlights(
  text: string,
  ranges: readonly HighlightRange[],
): { text: string; hit: boolean }[] {
  if (ranges.length === 0) return [{ text, hit: false }]

  // 防御重复或重叠区间：按起点排序并跳过与前一段重叠的
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const parts: { text: string; hit: boolean }[] = []
  let cursor = 0

  for (const [start, end] of sorted) {
    if (start < cursor || end <= start) continue
    if (start > cursor) parts.push({ text: text.slice(cursor, start), hit: false })
    parts.push({ text: text.slice(start, end), hit: true })
    cursor = end
  }

  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false })
  return parts
}
