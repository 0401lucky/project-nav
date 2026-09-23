import type { Env } from '../_types'

export interface Submission {
  id: string
  name: string
  url: string
  description?: string
  category?: string
  iconUrl?: string
  accentColor?: string
  // 投稿者信息
  contact?: string
  reason?: string
  // 元数据
  submittedAt: number
  ip?: string
  status: 'pending' | 'approved' | 'rejected'
  reviewedAt?: number
  reviewNote?: string
}

const KV_KEY = 'submissions'

// 单条投稿队列上限（KV value 大小有上限，超过就清理 30 天前已审核的）
const MAX_TOTAL = 500
const REVIEWED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export async function readSubmissions(env: Env): Promise<Submission[]> {
  const raw = await env.NAV_KV.get(KV_KEY)
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v)) return []
    return v.filter(isValid)
  } catch {
    return []
  }
}

export async function writeSubmissions(
  env: Env,
  list: Submission[],
): Promise<void> {
  await env.NAV_KV.put(KV_KEY, JSON.stringify(list))
}

// 队列满了：清理 30 天前已审核记录；如果还满，返回 false
export function tidyIfFull(list: Submission[]): { ok: boolean; list: Submission[] } {
  if (list.length < MAX_TOTAL) return { ok: true, list }
  const now = Date.now()
  const trimmed = list.filter(
    (s) =>
      s.status === 'pending' ||
      (s.reviewedAt && now - s.reviewedAt < REVIEWED_RETENTION_MS),
  )
  if (trimmed.length >= MAX_TOTAL) return { ok: false, list }
  return { ok: true, list: trimmed }
}

export function newSubmissionId(): string {
  const arr = new Uint8Array(8)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 12)
}

function isValid(s: unknown): s is Submission {
  if (!s || typeof s !== 'object') return false
  const o = s as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.url === 'string' &&
    typeof o.submittedAt === 'number' &&
    typeof o.status === 'string'
  )
}

// 公开返回时去除 IP 等敏感信息
export function sanitizeForPublic(s: Submission): Omit<Submission, 'ip' | 'contact'> {
  const { ip, contact, ...rest } = s
  return rest
}
