// 抓页面 + 元数据提取（供 /api/meta 与图标下载共用）
// 由旧 functions/_lib/scraper.ts 搬入，去掉 AI 工作台用的 bodyText 正文抽取

const FETCH_TIMEOUT_MS = 8000
const HTML_BYTES_LIMIT = 256 * 1024
const UA = 'Mozilla/5.0 (compatible; BookmarkNavBot/1.0)'

export interface FetchedPage {
  url: string
  finalUrl: string
  ok: boolean
  title?: string
  description?: string
  ogTitle?: string
  ogDescription?: string
  ogImage?: string
  twitterImage?: string
  /** 所有 logo / favicon 候选（已解析为绝对 URL，按优先级排序） */
  logoCandidates?: string[]
  errorMessage?: string
}

export async function fetchPage(url: string): Promise<FetchedPage> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: ctrl.signal,
    })
    if (!resp.ok) {
      return {
        url,
        finalUrl: resp.url || url,
        ok: false,
        errorMessage: `HTTP ${resp.status}`,
      }
    }
    const html = await readBoundedText(resp, HTML_BYTES_LIMIT)
    const finalUrl = resp.url || url
    const meta = extractMeta(html, finalUrl)
    return { url, finalUrl, ok: true, ...meta }
  } catch (e) {
    return {
      url,
      finalUrl: url,
      ok: false,
      errorMessage: (e as Error).message,
    }
  } finally {
    clearTimeout(timer)
  }
}

async function readBoundedText(
  resp: Response,
  limit: number,
): Promise<string> {
  if (!resp.body) return await resp.text()
  const reader = resp.body.getReader()
  let received = 0
  const chunks: Uint8Array[] = []
  while (received < limit) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    if (received >= limit) break
  }
  try {
    reader.cancel()
  } catch {
    /* ignore */
  }
  const total = Math.min(received, limit)
  const merged = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) {
    const take = Math.min(c.byteLength, total - pos)
    merged.set(c.subarray(0, take), pos)
    pos += take
    if (pos >= total) break
  }
  return new TextDecoder('utf-8').decode(merged)
}

export function extractMeta(
  html: string,
  baseUrl: string,
): Partial<FetchedPage> {
  const out: Partial<FetchedPage> = {}
  out.title = matchFirst(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
  out.description = matchAttr(html, [
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']description["']/i,
  ])
  out.ogTitle = matchAttr(html, [
    /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["']/i,
  ])
  out.ogDescription = matchAttr(html, [
    /<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:description["']/i,
  ])
  out.ogImage = matchAttr(html, [
    /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
  ])
  out.twitterImage = matchAttr(html, [
    /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,
  ])
  out.logoCandidates = extractLogoCandidates(html, baseUrl, out)
  return out
}

// 提取 logo 候选并解析成绝对 URL，按优先级排序
function extractLogoCandidates(
  html: string,
  baseUrl: string,
  meta: Partial<FetchedPage>,
): string[] {
  const candidates: { url: string; priority: number; size: number }[] = []
  const seen = new Set<string>()

  function add(raw: string | undefined, priority: number, size = 0) {
    if (!raw) return
    const abs = absoluteUrl(raw, baseUrl)
    if (!abs) return
    if (seen.has(abs)) return
    seen.add(abs)
    candidates.push({ url: abs, priority, size })
  }

  // 1) <link rel="apple-touch-icon" sizes="180x180" href="..."> —— 通常最高分辨率
  const linkRegex =
    /<link[^>]+rel=["']([^"']+)["'][^>]*?(?:sizes=["']([^"']+)["'])?[^>]*?href=["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = linkRegex.exec(html)) !== null) {
    const rel = m[1].toLowerCase()
    const size = parseSize(m[2] || '')
    const href = m[3]
    if (rel.includes('apple-touch-icon')) {
      add(href, 100, size)
    } else if (rel.includes('mask-icon')) {
      add(href, 30, size)
    } else if (rel.includes('shortcut icon') || rel === 'icon') {
      add(href, 50, size)
    } else if (rel.includes('fluid-icon')) {
      add(href, 40, size)
    }
  }

  // 2) og:image / twitter:image —— 适合做大图 logo
  add(meta.ogImage, 70)
  add(meta.twitterImage, 60)

  // 3) /favicon.ico fallback（如果 link 一个都没找到）
  if (candidates.length === 0) {
    try {
      const u = new URL(baseUrl)
      candidates.push({
        url: `${u.origin}/favicon.ico`,
        priority: 10,
        size: 0,
      })
    } catch {
      /* ignore */
    }
  }

  candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return b.size - a.size
  })
  return candidates.map((c) => c.url)
}

function parseSize(s: string): number {
  const m = s.match(/(\d+)x(\d+)/i)
  if (!m) return 0
  return parseInt(m[1], 10) * parseInt(m[2], 10)
}

function absoluteUrl(href: string, base: string): string | null {
  if (!href) return null
  try {
    return new URL(href, base).toString()
  } catch {
    return null
  }
}

function matchFirst(s: string, re: RegExp): string | undefined {
  const m = s.match(re)
  return m ? decodeEntities(m[1].trim()) : undefined
}

function matchAttr(s: string, regexps: RegExp[]): string | undefined {
  for (const re of regexps) {
    const m = s.match(re)
    if (m) return decodeEntities(m[1].trim())
  }
  return undefined
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

// ---------------- URL 工具 ----------------

export function normalizeUrl(s: string): string | null {
  let v = (s || '').trim()
  if (!v) return null
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v
  try {
    const u = new URL(v)
    if (!u.host || !u.host.includes('.')) return null
    return u.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i])
    }
  }
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    worker,
  )
  await Promise.all(workers)
  return results
}
