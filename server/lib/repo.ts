// 领域读取查询。所有列列表的排序规则在这里统一，避免各路由各写一份。

import type { BootstrapResponse, Bookmark, Group, Wallpaper } from '../../shared/types.ts'
import type { BookmarkRow, Db, GroupRow, WallpaperRow } from '../types.ts'
import { queryAll } from './query.ts'
import { toBookmark, toGroup, toWallpaper } from './serialize.ts'
import { readSettings } from './settings-store.ts'

/** 全站统一排序：sort_order 为主，created_at 兜底避免并列时顺序抖动 */
const GROUP_ORDER = 'ORDER BY sort_order ASC, created_at ASC'
const BOOKMARK_ORDER = 'ORDER BY sort_order ASC, created_at ASC'
const WALLPAPER_ORDER = 'ORDER BY created_at ASC'

export function listGroupRows(db: Db): GroupRow[] {
  return queryAll<GroupRow>(db, `SELECT * FROM groups ${GROUP_ORDER}`)
}

export function listBookmarkRows(db: Db): BookmarkRow[] {
  return queryAll<BookmarkRow>(db, `SELECT * FROM bookmarks ${BOOKMARK_ORDER}`)
}

export function listWallpaperRows(db: Db): WallpaperRow[] {
  return queryAll<WallpaperRow>(db, `SELECT * FROM wallpapers ${WALLPAPER_ORDER}`)
}

export function listGroups(db: Db): Group[] {
  return listGroupRows(db).map(toGroup)
}

export function listBookmarks(db: Db): Bookmark[] {
  return listBookmarkRows(db).map(toBookmark)
}

export function listWallpapers(db: Db): Wallpaper[] {
  return listWallpaperRows(db).map(toWallpaper)
}

export function readBootstrap(db: Db): BootstrapResponse {
  return {
    groups: listGroups(db),
    bookmarks: listBookmarks(db),
    settings: readSettings(db),
    wallpapers: listWallpapers(db),
  }
}
