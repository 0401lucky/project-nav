// 解析旧站「极光导航」导出的 JSON。
//
// 兼容两种形态，都是"旧站导出的 JSON"的合理来源：
//   1. GET /api/projects 的完整响应体：{ items: Project[] }
//   2. 只截取出来的数组：Project[]
//
// Project 里 name → 标题、category → 分组、description → 描述；
// 其余字段（id / icon / accentColor / pinned / private / visits / createdAt）
// 按 prd「砍掉点击计数与公开私有」的决定一律丢弃。

import type { ImportedBookmark, ImportedGroup } from '../types.ts'
import { UNCATEGORIZED_GROUP, ValidationError } from '../types.ts'
import { normalizeUrl } from './scraper.ts'

const TITLE_MAX = 200
const DESCRIPTION_MAX = 1000

export function parseLegacyJson(input: unknown): ImportedGroup[] {
  const items = extractItems(input)
  const groups = new Map<string, ImportedBookmark[]>()

  for (const item of items) {
    if (item === null || typeof item !== 'object') continue
    const record = item as Record<string, unknown>

    // 与写库路径共用 normalizeUrl，保证导入去重能对上库里的写法
    const url = normalizeUrl(typeof record.url === 'string' ? record.url : '')
    if (url === null) continue

    const title = firstText(record.name, TITLE_MAX) ?? url
    const description = firstText(record.description, DESCRIPTION_MAX)
    const name = firstText(record.category, 40) ?? UNCATEGORIZED_GROUP

    const bookmark: ImportedBookmark = { title, url, description }
    const bucket = groups.get(name)
    if (bucket === undefined) {
      groups.set(name, [bookmark])
    } else {
      bucket.push(bookmark)
    }
  }

  return [...groups].map(([name, bookmarks]) => ({ name, bookmarks }))
}

function extractItems(input: unknown): unknown[] {
  if (Array.isArray(input)) return input
  if (input !== null && typeof input === 'object') {
    const items = (input as { items?: unknown }).items
    if (Array.isArray(items)) return items
  }
  throw new ValidationError('无法识别这份 JSON：需要是书签数组，或含 items 数组的对象')
}

function firstText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (text === '') return undefined
  return text.slice(0, maxLength)
}
