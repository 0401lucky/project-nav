// 数据访问层：所有 SQL 与排序规则的落点。路由只做「解析 → 校验 → 调这里 → 响应」。
// 列列表的统一排序、换分组后的序号处理都集中在本文件，避免各路由各写一套。

import type { BootstrapResponse, Bookmark, Group, Wallpaper } from '../../shared/types.ts'
import type { BookmarkRow, Db, GroupRow, WallpaperRow } from '../types.ts'
import { newId } from './id.ts'
import { appendSortOrder, plannedOrders } from './order.ts'
import { execute, queryAll, queryOne, transaction } from './query.ts'
import { toBookmark, toGroup, toWallpaper } from './serialize.ts'
import { readSettings } from './settings-store.ts'

/** 全站统一排序：sort_order 为主，created_at 兜底避免并列时顺序抖动 */
const GROUP_ORDER = 'ORDER BY sort_order ASC, created_at ASC'
const BOOKMARK_ORDER = 'ORDER BY sort_order ASC, created_at ASC'
const WALLPAPER_ORDER = 'ORDER BY created_at ASC'

function requireRow<T>(row: T | undefined, what: string): T {
  if (row === undefined) throw new Error(`${what}写入后读不回来`)
  return row
}

// ---------------- 读取 ----------------

export function listGroupRows(db: Db): GroupRow[] {
  return queryAll<GroupRow>(db, `SELECT * FROM groups ${GROUP_ORDER}`)
}

export function listBookmarkRows(db: Db): BookmarkRow[] {
  return queryAll<BookmarkRow>(db, `SELECT * FROM bookmarks ${BOOKMARK_ORDER}`)
}

export function listWallpaperRows(db: Db): WallpaperRow[] {
  return queryAll<WallpaperRow>(db, `SELECT * FROM wallpapers ${WALLPAPER_ORDER}`)
}

export function findGroupRow(db: Db, id: string): GroupRow | undefined {
  return queryOne<GroupRow>(db, 'SELECT * FROM groups WHERE id = ?', id)
}

export function findBookmarkRow(db: Db, id: string): BookmarkRow | undefined {
  return queryOne<BookmarkRow>(db, 'SELECT * FROM bookmarks WHERE id = ?', id)
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

// ---------------- 分组写入 ----------------

export interface NewGroup {
  name: string
  icon: string | null
}

export interface GroupPatch {
  name?: string
  icon?: string | null
}

export function createGroup(db: Db, input: NewGroup): Group {
  const id = newId()
  const last = queryOne<{ max_order: number | null }>(
    db,
    'SELECT MAX(sort_order) AS max_order FROM groups',
  )
  execute(
    db,
    'INSERT INTO groups (id, name, icon, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
    id,
    input.name,
    input.icon,
    appendSortOrder(last?.max_order ?? null),
    Date.now(),
  )
  return toGroup(requireRow(findGroupRow(db, id), '分组'))
}

export function updateGroup(db: Db, id: string, patch: GroupPatch): Group | undefined {
  const current = findGroupRow(db, id)
  if (current === undefined) return undefined

  execute(
    db,
    'UPDATE groups SET name = ?, icon = ? WHERE id = ?',
    patch.name ?? current.name,
    patch.icon === undefined ? current.icon : patch.icon,
    id,
  )
  const updated = findGroupRow(db, id)
  return updated === undefined ? undefined : toGroup(updated)
}

/**
 * 删除分组。
 * @param moveTo 有值时把组内书签迁到该分组并追加到其末尾，否则靠外键级联一起删掉。
 */
export function deleteGroup(db: Db, id: string, moveTo: string | null): void {
  transaction(db, () => {
    if (moveTo !== null) {
      const now = Date.now()
      const rows = listBookmarkRows(db)
      const targetIds = rows.filter((row) => row.group_id === moveTo).map((row) => row.id)
      const movingIds = rows.filter((row) => row.group_id === id).map((row) => row.id)

      for (const { id: bookmarkId, sortOrder } of plannedOrders([...targetIds, ...movingIds])) {
        execute(
          db,
          'UPDATE bookmarks SET group_id = ?, sort_order = ?, updated_at = ? WHERE id = ?',
          moveTo,
          sortOrder,
          now,
          bookmarkId,
        )
      }
    }
    execute(db, 'DELETE FROM groups WHERE id = ?', id)
  })
}

export function reorderGroups(db: Db, ids: readonly string[]): void {
  transaction(db, () => {
    for (const { id, sortOrder } of plannedOrders(ids)) {
      execute(db, 'UPDATE groups SET sort_order = ? WHERE id = ?', sortOrder, id)
    }
  })
}

// ---------------- 书签写入 ----------------

export interface NewBookmark {
  groupId: string
  title: string
  url: string
  description: string | null
}

export interface BookmarkPatch {
  title?: string
  url?: string
  description?: string | null
  groupId?: string
}

export function createBookmark(db: Db, input: NewBookmark): Bookmark {
  const id = newId()
  const now = Date.now()
  const last = queryOne<{ max_order: number | null }>(
    db,
    'SELECT MAX(sort_order) AS max_order FROM bookmarks WHERE group_id = ?',
    input.groupId,
  )

  execute(
    db,
    `INSERT INTO bookmarks (id, group_id, title, url, description, has_icon, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    id,
    input.groupId,
    input.title,
    input.url,
    input.description,
    appendSortOrder(last?.max_order ?? null),
    now,
    now,
  )
  return toBookmark(requireRow(findBookmarkRow(db, id), '书签'))
}

export function updateBookmark(db: Db, id: string, patch: BookmarkPatch): Bookmark | undefined {
  const current = findBookmarkRow(db, id)
  if (current === undefined) return undefined

  const nextGroupId = patch.groupId ?? current.group_id
  execute(
    db,
    'UPDATE bookmarks SET group_id = ?, title = ?, url = ?, description = ?, updated_at = ? WHERE id = ?',
    nextGroupId,
    patch.title ?? current.title,
    patch.url ?? current.url,
    patch.description === undefined ? current.description : patch.description,
    Date.now(),
    id,
  )

  if (nextGroupId !== current.group_id) {
    appendToGroupEnd(db, id, nextGroupId)
  }

  const updated = findBookmarkRow(db, id)
  return updated === undefined ? undefined : toBookmark(updated)
}

export function deleteBookmark(db: Db, id: string): boolean {
  if (findBookmarkRow(db, id) === undefined) return false
  execute(db, 'DELETE FROM bookmarks WHERE id = ?', id)
  return true
}

/** 按给定顺序重编号，列表里不属于该分组的书签会被一并移入 */
export function reorderBookmarks(db: Db, groupId: string, ids: readonly string[]): void {
  const now = Date.now()
  transaction(db, () => {
    for (const { id, sortOrder } of plannedOrders(ids)) {
      execute(
        db,
        'UPDATE bookmarks SET group_id = ?, sort_order = ?, updated_at = ? WHERE id = ?',
        groupId,
        sortOrder,
        now,
        id,
      )
    }
  })
}

function appendToGroupEnd(db: Db, id: string, groupId: string): void {
  const last = queryOne<{ max_order: number | null }>(
    db,
    'SELECT MAX(sort_order) AS max_order FROM bookmarks WHERE group_id = ? AND id <> ?',
    groupId,
    id,
  )
  execute(
    db,
    'UPDATE bookmarks SET sort_order = ? WHERE id = ?',
    appendSortOrder(last?.max_order ?? null),
    id,
  )
}
