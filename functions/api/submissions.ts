import type { Env } from '../_types'
import { json, fail } from '../_lib/http'
import {
  readSubmissions,
  writeSubmissions,
  newSubmissionId,
  tidyIfFull,
  sanitizeForPublic,
  type Submission,
} from '../_lib/submissions'
import { fetchPage, normalizeUrl } from '../_lib/scraper'

// 防滥用参数
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 60 秒
const MAX_PER_IP_PER_WINDOW = 1
const MAX_PENDING_PER_IP = 5 // 单个 IP 最多 5 条 pending

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return fail(400, '请求体不是合法 JSON')
  }

  // 蜜罐字段：机器人通常会自动填，人不会
  if (typeof body.website === 'string' && body.website.trim()) {
    return fail(400, '提交失败')
  }

  const name = pickStr(body.name, 80)
  const url = normalizeUrl(pickStr(body.url, 500))
  const description = pickStr(body.description, 300)
  const category = pickStr(body.category, 24)
  const contact = pickStr(body.contact, 120)
  const reason = pickStr(body.reason, 500)
  const accentColor = pickStr(body.accentColor, 9)

  if (!name) return fail(400, '请填写项目名称')
  if (!url) return fail(400, '请填写合法的项目 URL（必须以 http(s) 开头）')

  const ip = request.headers.get('cf-connecting-ip') || 'unknown'
  let list = await readSubmissions(env)
  const now = Date.now()

  // 限频 1：60 秒内同 IP 最多 1 次
  const recentByIp = list.filter(
    (s) => s.ip === ip && now - s.submittedAt < RATE_LIMIT_WINDOW_MS,
  )
  if (recentByIp.length >= MAX_PER_IP_PER_WINDOW) {
    return fail(429, '提交过于频繁，请等 1 分钟后再试')
  }

  // 限频 2：同 IP 累计 pending 不超过 5 条
  const pendingByIp = list.filter(
    (s) => s.ip === ip && s.status === 'pending',
  )
  if (pendingByIp.length >= MAX_PENDING_PER_IP) {
    return fail(
      429,
      `你已有 ${pendingByIp.length} 条投稿待审核，请等管理员处理后再提交`,
    )
  }

  // URL 重复：已 pending 或 approved 直接拒
  const dup = list.find(
    (s) =>
      s.url === url && (s.status === 'pending' || s.status === 'approved'),
  )
  if (dup) {
    return fail(409, '这个项目已经在审核队列或已被收录')
  }

  // 队列满了：尝试清理 30 天前已审核记录
  const tidy = tidyIfFull(list)
  if (!tidy.ok) {
    return fail(503, '投稿队列已满，请稍后再试')
  }
  list = tidy.list

  // 同步抓 logo（即使失败也不影响投稿落库）
  let iconUrl: string | undefined
  try {
    const page = await fetchPage(url)
    if (page.ok && page.logoCandidates && page.logoCandidates.length > 0) {
      iconUrl = page.logoCandidates[0]
    }
  } catch {
    /* 抓 logo 失败不阻断投稿 */
  }
  if (!iconUrl) {
    try {
      iconUrl = `${new URL(url).origin}/favicon.ico`
    } catch {
      /* ignore */
    }
  }

  const submission: Submission = {
    id: newSubmissionId(),
    name,
    url,
    description: description || undefined,
    category: category || undefined,
    iconUrl,
    accentColor:
      accentColor && /^#[0-9a-f]{3,8}$/i.test(accentColor)
        ? accentColor
        : undefined,
    contact: contact || undefined,
    reason: reason || undefined,
    submittedAt: now,
    ip,
    status: 'pending',
  }
  list.unshift(submission)
  await writeSubmissions(env, list)

  return json({ ok: true, id: submission.id, submission: sanitizeForPublic(submission) })
}

function pickStr(v: unknown, max: number): string {
  if (typeof v !== 'string') return ''
  return v.trim().slice(0, max)
}
