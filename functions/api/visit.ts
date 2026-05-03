import type { Env, Project } from '../_types'
import { KV_KEYS } from '../_types'
import { json, fail } from '../_lib/http'

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { projectId?: string }
  try {
    body = (await request.json()) as { projectId?: string }
  } catch {
    return fail(400, '请求体不是合法 JSON')
  }
  const id = (body?.projectId || '').trim()
  if (!id) return fail(400, '缺少 projectId')

  const raw = await env.NAV_KV.get(KV_KEYS.projects)
  if (!raw) return json({ ok: false })

  let items: Project[]
  try {
    items = JSON.parse(raw)
    if (!Array.isArray(items)) throw new Error()
  } catch {
    return json({ ok: false })
  }

  const target = items.find((p) => p.id === id)
  if (!target) return json({ ok: false })

  target.visits = (target.visits || 0) + 1
  await env.NAV_KV.put(KV_KEYS.projects, JSON.stringify(items))
  return json({ ok: true, visits: target.visits })
}
