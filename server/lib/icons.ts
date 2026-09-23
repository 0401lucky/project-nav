// 图标本地化：下载 → sharp 转 64px WebP → 落盘，然后才把 has_icon 置 1。
// 顺序很关键：先落盘再置标记，has_icon=1 就意味着文件确实在。
// 任何一步失败都放弃，has_icon 保持 0，前端显示首字色块兜底。

import { unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import type { Db } from '../types.ts'
import type { DataPaths } from './paths.ts'
import { findBookmarkRow, setBookmarkHasIcon } from './repo.ts'
import { fetchPage, mapConcurrent, USER_AGENT } from './scraper.ts'

export const ICON_SIZE = 64
export const ICON_CONCURRENCY = 4

const MAX_ICON_BYTES = 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 8000
/** 单个书签最多试几个图标候选，避免候选多时把每个都试一遍 */
const MAX_ICON_ATTEMPTS = 4

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

  // 走 setBookmarkHasIcon 而不是直接 UPDATE：它会一起刷新 updated_at，
  // 前端靠 updated_at 变化感知"图标到位了"，缓存键才会换
  setBookmarkHasIcon(db, bookmarkId, true)
  return true
}

/**
 * 由一个网页地址取图标：先看页面自己声明的候选（apple-touch-icon / og:image
 * 这类通常是 PNG/SVG），逐个试到第一个成功为止，/favicon.ico 只作最后兜底。
 *
 * 为什么不能只用 favicon.ico：很多站点的 .ico 里嵌的是 BMP 格式，
 * sharp 解不了 ICO，直接下载必然失败。实测 github / 百度 / 知乎 / 掘金 / B 站
 * 的 .ico 全是 BMP 条目。改用页面候选后 7 个抽样站点里 6 个能拿到图标，
 * 只用 favicon.ico 时只有 1 个。
 * 只提供 BMP 型 .ico 的站点（如百度）仍会退回首字色块。
 */
export async function cacheIconFromPage(
  db: Db,
  paths: DataPaths,
  bookmarkId: string,
  pageUrl: string,
): Promise<boolean> {
  const candidates = await collectIconCandidates(pageUrl)
  for (const candidate of candidates.slice(0, MAX_ICON_ATTEMPTS)) {
    if (await cacheIcon(db, paths, bookmarkId, candidate)) return true
  }
  return false
}

async function collectIconCandidates(pageUrl: string): Promise<string[]> {
  const page = await fetchPage(pageUrl)
  const fromPage = page.ok ? (page.logoCandidates ?? []) : []

  const fallback = faviconSource(pageUrl)
  if (fallback === null) return [...new Set(fromPage)]

  // fetchPage 在页面没声明任何图标时也会给出 /favicon.ico，去重免得白试两次
  return [...new Set([...fromPage, fallback])]
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
  if (jobs.length === 0) return

  setImmediate(() => {
    void mapConcurrent(jobs, ICON_CONCURRENCY, (job) =>
      cacheIconFromPage(db, paths, job.id, job.url),
    ).catch(() => {
      /* 每个任务内部都已兜住，这里只是保险 */
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
