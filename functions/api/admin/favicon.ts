import type { Env } from '../../_types'
import { json, fail } from '../../_lib/http'
import { getBearer, verifyToken } from '../../_lib/auth'
import { fetchPage, normalizeUrl } from '../../_lib/scraper'

// POST /api/admin/favicon
// body: { url: string }
// resp: { best: string|null, candidates: string[], title?: string }
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = getBearer(request)
  if (!(await verifyToken(env.EDIT_SECRET, token))) {
    return fail(401, '未授权')
  }
  let body: { url?: string }
  try {
    body = (await request.json()) as { url?: string }
  } catch {
    return fail(400, '请求体不是合法 JSON')
  }
  const url = normalizeUrl(body.url || '')
  if (!url) return fail(400, '不是合法的 URL')

  const page = await fetchPage(url)
  if (!page.ok) {
    // 抓取失败时，给 /favicon.ico 兜底
    let fallback: string | null = null
    try {
      fallback = `${new URL(url).origin}/favicon.ico`
    } catch {
      /* ignore */
    }
    return json({
      best: fallback,
      candidates: fallback ? [fallback] : [],
      title: undefined,
      warning: page.errorMessage,
    })
  }
  const candidates = page.logoCandidates || []
  return json({
    best: candidates[0] || null,
    candidates,
    title: page.ogTitle || page.title,
  })
}
