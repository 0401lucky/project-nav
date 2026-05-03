import type { Env, Project, HealthSample, HealthSummary } from '../_types'
import { KV_KEYS, HEALTH_HISTORY_LIMIT } from '../_types'

const TIMEOUT_MS = 6000
const UA = 'NavAurora-HealthCheck/1.0'

export async function pingOne(url: string): Promise<HealthSample> {
  const start = Date.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    let resp: Response
    try {
      resp = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': UA },
      })
      // 部分服务不支持 HEAD：返回 4xx 时回退 GET
      if (!resp.ok && (resp.status === 405 || resp.status === 403 || resp.status === 400)) {
        resp = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: ctrl.signal,
          headers: { 'User-Agent': UA },
        })
      }
    } catch {
      resp = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': UA },
      })
    }
    return {
      ts: Date.now(),
      ok: resp.ok,
      status: resp.status,
      latencyMs: Date.now() - start,
    }
  } catch {
    return {
      ts: Date.now(),
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function appendSample(
  env: Env,
  projectId: string,
  sample: HealthSample,
): Promise<HealthSample[]> {
  const key = KV_KEYS.healthHistory(projectId)
  const raw = await env.NAV_KV.get(key)
  let history: HealthSample[] = []
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) history = parsed
    } catch {
      /* 损坏数据忽略 */
    }
  }
  history.push(sample)
  if (history.length > HEALTH_HISTORY_LIMIT) {
    history = history.slice(-HEALTH_HISTORY_LIMIT)
  }
  await env.NAV_KV.put(key, JSON.stringify(history))
  return history
}

export function summarize(samples: HealthSample[]): HealthSummary {
  if (!samples.length) {
    return { status: 'unknown', latencyMs: 0, uptime: 0, lastChecked: 0, samples: [] }
  }
  const last = samples[samples.length - 1]
  const okCount = samples.filter((s) => s.ok).length
  const status: HealthSummary['status'] = !last.ok
    ? 'offline'
    : last.latencyMs > 2000
    ? 'degraded'
    : 'online'
  return {
    status,
    latencyMs: last.latencyMs,
    uptime: okCount / samples.length,
    lastChecked: last.ts,
    samples,
  }
}

interface SummaryStore {
  summaries: Record<string, HealthSummary>
  updatedAt: number
}

async function readSummaryStore(env: Env): Promise<SummaryStore> {
  const raw = await env.NAV_KV.get(KV_KEYS.healthSummary)
  if (!raw) return { summaries: {}, updatedAt: 0 }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return {
        summaries: parsed.summaries || {},
        updatedAt: parsed.updatedAt || 0,
      }
    }
  } catch {
    /* ignore */
  }
  return { summaries: {}, updatedAt: 0 }
}

async function readProjects(env: Env): Promise<Project[]> {
  const raw = await env.NAV_KV.get(KV_KEYS.projects)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch {
    /* ignore */
  }
  return []
}

export async function refreshAll(env: Env): Promise<SummaryStore> {
  const projects = await readProjects(env)
  if (!projects.length) {
    const empty: SummaryStore = { summaries: {}, updatedAt: Date.now() }
    await env.NAV_KV.put(KV_KEYS.healthSummary, JSON.stringify(empty))
    return empty
  }

  const entries = await Promise.all(
    projects.map(async (p) => {
      const sample = await pingOne(p.url)
      const history = await appendSample(env, p.id, sample)
      return [p.id, summarize(history)] as const
    }),
  )

  const store: SummaryStore = {
    summaries: Object.fromEntries(entries),
    updatedAt: Date.now(),
  }
  await env.NAV_KV.put(KV_KEYS.healthSummary, JSON.stringify(store))
  return store
}

export async function checkOne(
  env: Env,
  projectId: string,
): Promise<HealthSummary | null> {
  const projects = await readProjects(env)
  const target = projects.find((p) => p.id === projectId)
  if (!target) return null

  const sample = await pingOne(target.url)
  const history = await appendSample(env, projectId, sample)
  const summary = summarize(history)

  const store = await readSummaryStore(env)
  store.summaries[projectId] = summary
  store.updatedAt = Date.now()
  await env.NAV_KV.put(KV_KEYS.healthSummary, JSON.stringify(store))

  return summary
}
