// 图标本地化：下载 → 按文件头识别 → 转 64px WebP → 落盘，然后才把 has_icon 置 1。
// 顺序很关键：先落盘再置标记，has_icon=1 就意味着文件确实在。
// 任何一步失败都放弃并给出原因，has_icon 保持原样，前端显示原图标或首字色块。

import { unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import type { Sharp } from 'sharp'
import type { MissingIconFailure, MissingIconReport } from '../../shared/types.ts'
import type { Db } from '../types.ts'
import { decodeIco, isIco } from './ico.ts'
import type { DataPaths } from './paths.ts'
import { findBookmarkRow, listBookmarkRows, setBookmarkHasIcon } from './repo.ts'
import { fetchPage, mapConcurrent, USER_AGENT } from './scraper.ts'

export const ICON_SIZE = 64
export const ICON_CONCURRENCY = 4
export const MAX_ICON_BYTES = 1024 * 1024

const DOWNLOAD_TIMEOUT_MS = 8000
/** 单个书签最多试几个图标候选，避免候选多时把每个都试一遍 */
const MAX_ICON_ATTEMPTS = 4

export type IconResult = { ok: true } | { ok: false; reason: string }

type Step<T> = { ok: true; value: T } | { ok: false; reason: string }

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

/** 公共图标服务地址。只能在用户主动点击时用：会把网址告诉第三方 */
export function publicIconSource(url: string): string | null {
  try {
    const host = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`
  } catch {
    return null
  }
}

type ImageKind = 'png' | 'jpeg' | 'gif' | 'webp' | 'avif' | 'ico' | 'svg'

/** 按文件头判断，不信 Content-Type：实测有站点标签写 png、实际给 ICO */
export function sniffImage(buf: Buffer): ImageKind | null {
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x89504e47) return 'png'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg'
  if (buf.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif'
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'webp'
  }
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') return 'avif'
  if (isIco(buf)) return 'ico'
  const head = buf.subarray(0, 1024).toString('utf8').trimStart().toLowerCase()
  if ((head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!--')) && head.includes('<svg')) {
    return 'svg'
  }
  return null
}

/** 任意来源的图片字节 → 64px WebP */
export async function encodeIcon(raw: Buffer): Promise<Step<Buffer>> {
  const kind = sniffImage(raw)
  if (kind === null) return { ok: false, reason: '返回的内容不是图片' }

  let input: Sharp
  if (kind === 'ico') {
    const decoded = decodeIco(raw)
    if (decoded === null) return { ok: false, reason: '图标是不支持的 ICO 格式' }
    input =
      decoded.kind === 'png'
        ? sharp(decoded.data)
        : sharp(decoded.data, { raw: { width: decoded.width, height: decoded.height, channels: 4 } })
  } else {
    // 服务器没有字体，SVG 里的文字会渲染成方框，宁可不要
    if (kind === 'svg' && /<text[\s>]/i.test(raw.toString('utf8'))) {
      return { ok: false, reason: '图标是带文字的 SVG，服务器无法正确渲染' }
    }
    input = sharp(raw)
  }

  try {
    const webp = await input
      .resize(ICON_SIZE, ICON_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 80 })
      .toBuffer()
    return { ok: true, value: webp }
  } catch {
    return { ok: false, reason: '图片无法解码' }
  }
}

/** 编码好的图标落盘并置标记 */
async function storeIcon(db: Db, paths: DataPaths, bookmarkId: string, raw: Buffer): Promise<IconResult> {
  const encoded = await encodeIcon(raw)
  if (!encoded.ok) return encoded

  // 用户可能在下载途中就把书签删了，别留下无主的图标文件
  if (findBookmarkRow(db, bookmarkId) === undefined) return { ok: false, reason: '书签已被删除' }

  try {
    await writeFile(iconFilePath(paths, bookmarkId), encoded.value)
  } catch {
    return { ok: false, reason: '图标写入磁盘失败' }
  }

  // 走 setBookmarkHasIcon 而不是直接 UPDATE：它会一起刷新 updated_at，
  // 前端靠 updated_at 变化感知"图标到位了"，缓存键才会换
  setBookmarkHasIcon(db, bookmarkId, true)
  return { ok: true }
}

/** 用户上传或粘贴的图片 */
export async function cacheIconFromBuffer(
  db: Db,
  paths: DataPaths,
  bookmarkId: string,
  raw: Buffer,
): Promise<IconResult> {
  if (raw.byteLength === 0) return { ok: false, reason: '文件是空的' }
  if (raw.byteLength > MAX_ICON_BYTES) return { ok: false, reason: '图片不能超过 1MB' }
  return storeIcon(db, paths, bookmarkId, raw)
}

/** 下载并缓存一张指定的图 */
export async function cacheIcon(
  db: Db,
  paths: DataPaths,
  bookmarkId: string,
  sourceUrl: string,
): Promise<IconResult> {
  const raw = await downloadImage(sourceUrl)
  if (!raw.ok) return raw
  return storeIcon(db, paths, bookmarkId, raw.value)
}

/**
 * 由一个网页地址取图标：preferred（用户在表单里选中的候选）优先，
 * 再试页面声明的候选，/favicon.ico 最后兜底。
 */
export async function cacheIconFromPage(
  db: Db,
  paths: DataPaths,
  bookmarkId: string,
  pageUrl: string,
  preferred?: string,
): Promise<IconResult> {
  if (preferred !== undefined) {
    const first = await cacheIcon(db, paths, bookmarkId, preferred)
    if (first.ok) return first
  }

  const page = await fetchPage(pageUrl)
  const fromPage = page.ok ? (page.logoCandidates ?? []) : []
  const fallback = faviconSource(pageUrl)
  const candidates = [...new Set([...fromPage, ...(fallback === null ? [] : [fallback])])].filter(
    (candidate) => candidate !== preferred,
  )

  // 记排第一的候选为什么失败：它是站点主推的图标，比兜底的 favicon 404 更能说明问题
  let firstReason: string | null = null
  for (const candidate of candidates.slice(0, MAX_ICON_ATTEMPTS)) {
    const result = await cacheIcon(db, paths, bookmarkId, candidate)
    if (result.ok) return result
    firstReason ??= result.reason
  }

  // 页面本身打不开时，页面的原因比「favicon 404」更有用
  if (!page.ok) return { ok: false, reason: page.errorMessage ?? '页面打不开' }
  if (fromPage.length === 0 || fromPage.every((candidate) => candidate === fallback)) {
    return { ok: false, reason: '站点没有提供图标' }
  }
  return { ok: false, reason: `站点声明的图标不可用：${firstReason ?? '未知原因'}` }
}

/** 给所有还没有图标的书签补抓一次，返回统计 */
export async function refetchMissingIcons(db: Db, paths: DataPaths): Promise<MissingIconReport> {
  const rows = listBookmarkRows(db).filter((row) => row.has_icon === 0)
  const results = await mapConcurrent(rows, ICON_CONCURRENCY, (row) =>
    cacheIconFromPage(db, paths, row.id, row.url),
  )
  const failed: MissingIconFailure[] = []
  results.forEach((result, i) => {
    if (!result.ok) failed.push({ id: rows[i]!.id, title: rows[i]!.title, reason: result.reason })
  })
  return { total: rows.length, succeeded: rows.length - failed.length, failed }
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
  pageUrl: string,
  preferred?: string,
): void {
  setImmediate(() => {
    void cacheIconFromPage(db, paths, bookmarkId, pageUrl, preferred).catch(() => {
      /* 内部已兜住，这里只是保险 */
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

async function downloadImage(url: string): Promise<Step<Buffer>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*;q=0.8' },
      redirect: 'follow',
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, reason: `图标地址返回 HTTP ${response.status}` }

    const declared = Number(response.headers.get('content-length') ?? '0')
    if (declared > MAX_ICON_BYTES) return { ok: false, reason: '图标超过 1MB' }

    const raw = Buffer.from(await response.arrayBuffer())
    // content-length 可能缺失或撒谎，读完再卡一次
    if (raw.byteLength === 0) return { ok: false, reason: '图标地址返回了空内容' }
    if (raw.byteLength > MAX_ICON_BYTES) return { ok: false, reason: '图标超过 1MB' }
    return { ok: true, value: raw }
  } catch {
    return { ok: false, reason: controller.signal.aborted ? '下载图标超时' : '无法下载图标' }
  } finally {
    clearTimeout(timer)
  }
}
