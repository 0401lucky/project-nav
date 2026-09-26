// 抓页面 + 元数据提取（供 /api/meta 与图标下载共用）
// 由旧 functions/_lib/scraper.ts 搬入，去掉 AI 工作台用的 bodyText 正文抽取

const FETCH_TIMEOUT_MS = 8000
const HTML_BYTES_LIMIT = 256 * 1024
export const USER_AGENT = 'Mozilla/5.0 (compatible; BookmarkNavBot/1.0)'

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
        'User-Agent': USER_AGENT,
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
        errorMessage: describeHttpFailure(resp),
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
      errorMessage: ctrl.signal.aborted ? '页面 8 秒内没有响应' : describeNetworkFailure(e),
    }
  } finally {
    clearTimeout(timer)
  }
}

function describeHttpFailure(resp: Response): string {
  if (resp.headers.get('cf-mitigated') === 'challenge') {
    return '站点开启了 Cloudflare 人机验证，服务器无法访问'
  }
  if (resp.status === 404) return '页面不存在（HTTP 404）'
  if (resp.status === 526) return '站点证书无效（HTTP 526）'
  return `页面返回 HTTP ${resp.status}`
}

/** undici 把真正的原因放在 cause.code 里，message 只有一句 fetch failed */
function describeNetworkFailure(error: unknown): string {
  const code = (error as { cause?: { code?: string } }).cause?.code ?? ''
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return '域名不存在或无法解析'
  if (code === 'ECONNREFUSED') return '连接被拒绝'
  if (code === 'ECONNRESET') return '连接被重置'
  if (code.startsWith('ERR_TLS') || code.includes('CERT')) return '站点证书无效'
  return '无法连接到站点'
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
  return decodeHtml(merged, resp.headers.get('content-type'))
}

/**
 * 先认响应头的 charset，再认页面开头的 <meta> 声明，都没有才当 UTF-8。
 * 不少中文老站是 GBK/GB2312，写死 UTF-8 会让标题变成乱码。
 */
function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
  // 按 HTML 规范只预扫前 1024 字节；latin1 逐字节映射，扫 ASCII 声明不会被多字节编码干扰
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  const label = charsetOf(contentType ?? '') ?? charsetOf(head) ?? 'utf-8'
  try {
    return new TextDecoder(label).decode(bytes)
  } catch {
    // 不认识的编码名
    return new TextDecoder('utf-8').decode(bytes)
  }
}

function charsetOf(text: string): string | undefined {
  return /charset\s*=\s*["']?\s*([\w-]+)/i.exec(text)?.[1]
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

  // 1) 页面声明的图标。先切出每个 <link> 标签再解析属性，属性顺序、引号写法都不影响
  for (const tag of html.match(/<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) ?? []) {
    const attrs = parseAttributes(tag)
    const rels = (attrs.get('rel') ?? '').toLowerCase().split(/\s+/)
    const href = attrs.get('href')
    if (href === undefined) continue
    const size = parseSize(attrs.get('sizes') ?? '')
    if (rels.includes('apple-touch-icon') || rels.includes('apple-touch-icon-precomposed')) {
      add(href, 100, size)
    } else if (rels.includes('icon')) {
      add(href, 90, size)
    } else if (rels.includes('fluid-icon')) {
      add(href, 40, size)
    } else if (rels.includes('mask-icon')) {
      add(href, 30, size)
    }
  }

  // 2) og:image / twitter:image —— 通常是分享横幅，只在页面没声明图标时才轮到
  add(meta.ogImage, 20)
  add(meta.twitterImage, 15)

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

/**
 * 解析一个标签的属性，支持双引号、单引号、无引号三种写法。
 * 值按引号配对读取：双引号里的 data:image/svg+xml,<svg xmlns='…'> 不会在单引号处截断。
 */
export function parseAttributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>()
  const body = tag.replace(/^<\w+/, '').replace(/\/?>$/, '')
  const re = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const name = m[1]!.toLowerCase()
    if (attrs.has(name)) continue
    attrs.set(name, decodeHtmlEntities(m[2] ?? m[3] ?? m[4] ?? ''))
  }
  return attrs
}

/** 多个尺寸（sizes="16x16 32x32"）取最大的；any（SVG）视为很大 */
function parseSize(s: string): number {
  if (/\bany\b/i.test(s)) return 1024 * 1024
  let best = 0
  for (const m of s.matchAll(/(\d+)x(\d+)/gi)) {
    best = Math.max(best, parseInt(m[1]!, 10) * parseInt(m[2]!, 10))
  }
  return best
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
  return m ? decodeHtmlEntities(m[1].trim()) : undefined
}

function matchAttr(s: string, regexps: RegExp[]): string | undefined {
  for (const re of regexps) {
    const m = s.match(re)
    if (m) return decodeHtmlEntities(m[1].trim())
  }
  return undefined
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

// ---------------- URL 工具 ----------------

/**
 * 把用户输入规范化成可存储的绝对 URL，无法识别时返回 null。
 * 全站唯一入口：写库、抓取、导入去重都走这里，保证同一个网址只有一种写法
 * （否则 https://x.com 与 https://x.com/ 会被当成两条书签）。
 */
export function normalizeUrl(s: string): string | null {
  let v = (s || '').trim()
  if (!v) return null
  const hadScheme = /^https?:\/\//i.test(v)
  if (!hadScheme) v = 'https://' + v
  try {
    const u = new URL(v)
    if (!u.host) return null
    // 用 hostname 而不是 host：host 含端口，localhost:3000 会因此匹配不上；
    // 没写协议头时要求是点号域名或 localhost，避免把「abc」这类随手输入当成网址；
    // 显式写了 http:// 就照收，内网主机名（http://nas/）也才算合法
    if (!hadScheme && !u.hostname.includes('.') && u.hostname !== 'localhost') return null
    return u.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

export async function mapConcurrent<T, R>(
  items: readonly T[],
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
