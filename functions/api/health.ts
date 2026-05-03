import type { Env, HealthSummary } from '../_types'
import { KV_KEYS } from '../_types'
import { json, fail } from '../_lib/http'
import { getBearer, verifyToken } from '../_lib/auth'
import { refreshAll, checkOne } from '../_lib/check'

const STALE_MS = 5 * 60 * 1000

interface SummaryStore {
  summaries: Record<string, HealthSummary>
  updatedAt: number
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const raw = await ctx.env.NAV_KV.get(KV_KEYS.healthSummary)
  let store: SummaryStore = { summaries: {}, updatedAt: 0 }
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        store = {
          summaries: parsed.summaries || {},
          updatedAt: parsed.updatedAt || 0,
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (Date.now() - store.updatedAt > STALE_MS) {
    ctx.waitUntil(refreshAll(ctx.env).catch(() => {}))
  }

  return json(store)
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = getBearer(request)
  if (!(await verifyToken(env.EDIT_SECRET, token))) {
    return fail(401, '未授权')
  }

  let body: { projectId?: string }
  try {
    body = (await request.json()) as { projectId?: string }
  } catch {
    return fail(400, '请求体不是合法 JSON')
  }
  const id = (body?.projectId || '').trim()
  if (!id) return fail(400, '缺少 projectId')

  const summary = await checkOne(env, id)
  if (!summary) return fail(404, '项目不存在')
  return json({ summary })
}
