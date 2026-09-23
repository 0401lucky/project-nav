// 图标本地化：下载 → sharp 转 64px WebP → 落盘，然后才把 has_icon 置 1。
// 顺序很关键：先落盘再置标记，has_icon=1 就意味着文件确实在。
// 任何一步失败都放弃，has_icon 保持 0，前端显示首字色块兜底。

import { unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import type { Db } from '../types.ts'
import type { DataPaths } from './paths.ts'
import { execute } from './query.ts'
import { findBookmarkRow } from './repo.ts'
import { mapConcurrent, USER_AGENT } from './scraper.ts'

export const ICON_SIZE = 64
export const ICON_CONCURRENCY = 4

const MAX_ICON_BYTES = 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 8000

export function iconFilePath(paths: DataPaths, bookmarkId: string): string {
  return join(paths.iconsDir, `${bookmarkId}.webp`)
}

/** 对外暴露的图标地址，与 app.ts 挂载的 /icons/* 对应 */
export function iconPath(bookmarkId: string): string {
  return `/icons/${bookmarkId}.webp`
}

/** 没有抓到图标候选时的兜底来源：站点根目录的 favicon.ico */
export function faviconSource(url: string): string | null {
  try {
    return `${new URL(url).origin}/favicon.ico`
  } catch {
    return null
  }
}

/** 下载并缓存一个书签的图标，返回是否成功 */
export async function cacheIcon(
  db: Db,
  paths: DataPaths,
  bookmarkId: string,
  sourceUrl: string,
): Promise<boolean> {
  const raw = await downloadImage(sourceUrl)
  if (raw === null) return false

  let webp: Buffer
  try {
    webp = await sharp(raw)
      .resize(ICON_SIZE, ICON_SIZE, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer()
  } catch {
    return false
  }

  // 用户可能在下载途中就把书签删了，别留下无主的图标文件
  if (findBookmarkRow(db, bookmarkId) === undefined) return false

  try {
    await writeFile(iconFilePath(paths, bookmarkId), webp)
  } catch {
    return false
  }

  execute(db, 'UPDATE bookmarks SET has_icon = 1 WHERE id = ?', bookmarkId)
  return true
}

export async function deleteIcons(paths: DataPaths, bookmarkIds: readonly string[]): Promise<void> {
  await Promise.all(
    bookmarkIds.map(async (id) => {
      try {
        await unlink(iconFilePath(paths, id))
      } catch {
        /* 本来就没有图标文件，忽略 */
      }
    }),
  )
}

/**
 * 落库返回之后再抓图标：新增书签不该被外部站点的响应速度拖住。
 * 用 setImmediate 而不是 await，让 HTTP 响应先发出去。
 */
export function scheduleIconCache(
  db: Db,
  paths: DataPaths,
  bookmarkId: string,
  sourceUrl: string,
): void {
  setImmediate(() => {
    void cacheIcon(db, paths, bookmarkId, sourceUrl).catch(() => {
      /* cacheIcon 内部已兜住，这里只是保险 */
    })
  })
}

export interface IconJob {
  id: string
  url: string
}

/** 批量抓图标，并发限制在 4，避免导入时把对端站点打爆 */
export function scheduleIconBatch(db: Db, paths: DataPaths, jobs: readonly IconJob[]): void {
  const pending = jobs
    .map((job) => ({ id: job.id, source: faviconSource(job.url) }))
    .filter((job): job is { id: string; source: string } => job.source !== null)

  if (pending.length === 0) return

  setImmediate(() => {
    void mapConcurrent(pending, ICON_CONCURRENCY, (job) =>
      cacheIcon(db, paths, job.id, job.source),
    ).catch(() => {
      /* 同上 */
    })
  })
}

async function downloadImage(url: string): Promise<Buffer | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) return null

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.toLowerCase().startsWith('image/')) return null

    const declared = Number(response.headers.get('content-length') ?? '0')
    if (declared > MAX_ICON_BYTES) return null

    const raw = Buffer.from(await response.arrayBuffer())
    // content-length 可能缺失或撒谎，读完再卡一次
    if (raw.byteLength === 0 || raw.byteLength > MAX_ICON_BYTES) return null
    return raw
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
