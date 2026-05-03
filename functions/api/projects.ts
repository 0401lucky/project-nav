import type { Env, Project } from '../_types'
import { KV_KEYS } from '../_types'
import { json, fail } from '../_lib/http'
import { getBearer, verifyToken } from '../_lib/auth'

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const raw = await env.NAV_KV.get(KV_KEYS.projects)
  let items: Project[] = []
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) items = parsed
    } catch {
      /* 数据损坏：返回空 */
    }
  }
  return json({ items })
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const token = getBearer(request)
  if (!(await verifyToken(env.EDIT_SECRET, token))) {
    return fail(401, '未授权')
  }

  let body: { items?: unknown }
  try {
    body = (await request.json()) as { items?: unknown }
  } catch {
    return fail(400, '请求体不是合法 JSON')
  }
  if (!Array.isArray(body.items)) return fail(400, 'items 必须是数组')

  const sanitized: Project[] = []
  for (const raw of body.items) {
    if (!raw || typeof raw !== 'object') continue
    const p = raw as Partial<Project>
    if (!p.id || !p.name || !p.url || !p.category) continue
    if (!/^https?:\/\//i.test(p.url)) continue
    sanitized.push({
      id: String(p.id).slice(0, 32),
      name: String(p.name).slice(0, 80),
      url: String(p.url).slice(0, 500),
      description: p.description ? String(p.description).slice(0, 300) : undefined,
      category: String(p.category).slice(0, 24),
      icon: p.icon ? String(p.icon).slice(0, 200) : undefined,
      accentColor: p.accentColor ? String(p.accentColor).slice(0, 9) : undefined,
      pinned: !!p.pinned,
      createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
      visits: typeof p.visits === 'number' ? p.visits : 0,
    })
  }

  await env.NAV_KV.put(KV_KEYS.projects, JSON.stringify(sanitized))
  return json({ ok: true, count: sanitized.length })
}
