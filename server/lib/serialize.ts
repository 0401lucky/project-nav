// 数据库行 → API 形状的唯一转换点。
// 所有对外响应都必须经过这里，避免同一字段在不同路由里各自拼装。

import type { Bookmark, Group, Wallpaper } from '../../shared/types.ts'
import type { BookmarkRow, GroupRow, WallpaperRow } from '../types.ts'

export function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    sortOrder: row.sort_order,
  }
}

export function toBookmark(row: BookmarkRow): Bookmark {
  return {
    id: row.id,
    groupId: row.group_id,
    title: row.title,
    url: row.url,
    description: row.description,
    hasIcon: row.has_icon === 1,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  }
}

export function toWallpaper(row: WallpaperRow): Wallpaper {
  return {
    id: row.id,
    builtin: row.builtin === 1,
    orientation: row.orientation === 'portrait' ? 'portrait' : 'landscape',
    pairId: row.pair_id,
    widths: parseWidths(row.widths),
  }
}

/** 档位宽度存在 TEXT 列里，坏数据一律当空数组，不让前端拿到非法 srcset */
export function parseWidths(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is number => typeof value === 'number' && value > 0)
  } catch {
    return []
  }
}
