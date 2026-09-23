import type { Env, Project } from '../../_types'
import { KV_KEYS } from '../../_types'
import { json, fail } from '../../_lib/http'
import { getBearer, verifyToken } from '../../_lib/auth'
import {
  readSubmissions,
  writeSubmissions,
  type Submission,
} from '../../_lib/submissions'

// GET /api/admin/submissions
// 返回所有投稿，按提交时间倒序，pending 优先
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const token = getBearer(request)
  if (!(await verifyToken(env.EDIT_SECRET, token))) {
    return fail(401, '未授权')
  }
  const list = await readSubmissions(env)
  // 排序：pending 优先 → 然后按提交时间倒序
  const sorted = list.slice().sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (b.status === 'pending' && a.status !== 'pending') return 1
    return b.submittedAt - a.submittedAt
  })
  const stats = {
    total: list.length,
    pending: list.filter((s) => s.status === 'pending').length,
    approved: list.filter((s) => s.status === 'approved').length,
    rejected: list.filter((s) => s.status === 'rejected').length,
  }
  return json({ items: sorted, stats })
}

// POST /api/admin/submissions
// body: { id, action: 'approve' | 'reject' | 'delete', edits?: Partial<Project>, note?: string }
//   - approve: 写入 projects KV，submission 状态变 approved
//   - reject : submission 状态变 rejected，可填 note
//   - delete : 直接从队列移除
interface ActionBody {
  id?: string
  action?: 'approve' | 'reject' | 'delete'
  edits?: Partial<Project> & { private?: boolean }
  note?: string
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = getBearer(request)
  if (!(await verifyToken(env.EDIT_SECRET, token))) {
    return fail(401, '未授权')
  }
  let body: ActionBody
  try {
    body = (await request.json()) as ActionBody
  } catch {
    return fail(400, '请求体不是合法 JSON')
  }
  const id = (body.id || '').trim()
  const action = body.action
  if (!id) return fail(400, '缺少 id')
  if (!action) return fail(400, '缺少 action')

  const list = await readSubmissions(env)
  const idx = list.findIndex((s) => s.id === id)
  if (idx < 0) return fail(404, '未找到该投稿')
  const sub = list[idx]

  const note = (body.note || '').trim().slice(0, 300) || undefined

  if (action === 'delete') {
    list.splice(idx, 1)
    await writeSubmissions(env, list)
    return json({ ok: true })
  }

  if (action === 'reject') {
    list[idx] = {
      ...sub,
      status: 'rejected',
      reviewedAt: Date.now(),
      reviewNote: note,
    }
    await writeSubmissions(env, list)
    return json({ ok: true })
  }

  if (action === 'approve') {
    // 把投稿合并管理员可能修改的字段，写入 projects KV
    const merged = mergeWithEdits(sub, body.edits || {})
    if (!merged.name) return fail(400, '名称不能为空')
    if (!merged.url || !/^https?:\/\//i.test(merged.url)) {
      return fail(400, 'URL 不合法')
    }

    // 读现有 projects，去重后追加
    const projRaw = await env.NAV_KV.get(KV_KEYS.projects)
    let projects: Project[] = []
    if (projRaw) {
      try {
        const v = JSON.parse(projRaw)
        if (Array.isArray(v)) projects = v
      } catch {
        /* 数据损坏：新建 */
      }
    }
    if (projects.some((p) => p.url === merged.url)) {
      // 已存在同 URL：仍然把投稿置为 approved（避免反复处理）
      list[idx] = {
        ...sub,
        status: 'approved',
        reviewedAt: Date.now(),
        reviewNote: '该 URL 已在 projects 中存在，未重复添加',
      }
      await writeSubmissions(env, list)
      return json({ ok: true, warning: '同 URL 已存在，未重复添加' })
    }
    projects.unshift(merged)
    await env.NAV_KV.put(KV_KEYS.projects, JSON.stringify(projects))

    list[idx] = {
      ...sub,
      status: 'approved',
      reviewedAt: Date.now(),
      reviewNote: note,
    }
    await writeSubmissions(env, list)
    return json({ ok: true, project: merged })
  }

  return fail(400, '未知 action')
}

function mergeWithEdits(
  sub: Submission,
  edits: Partial<Project> & { private?: boolean },
): Project {
  const id = newProjectId()
  return {
    id,
    name: pickStr(edits.name, sub.name, 80),
    url: pickStr(edits.url, sub.url, 500),
    description: pickStr(edits.description, sub.description || '', 300) || undefined,
    category: pickStr(edits.category, sub.category || '默认', 24) || '默认',
    icon: pickStr(edits.icon, sub.iconUrl || '', 500) || undefined,
    accentColor:
      pickStr(edits.accentColor, sub.accentColor || '#8b5cf6', 9) || undefined,
    pinned: !!edits.pinned,
    private: !!edits.private,
    createdAt: Date.now(),
    visits: 0,
  }
}

function pickStr(
  primary: unknown,
  fallback: string,
  max: number,
): string {
  if (typeof primary === 'string' && primary.trim()) {
    return primary.trim().slice(0, max)
  }
  return (fallback || '').slice(0, max)
}

function newProjectId(): string {
  const arr = new Uint8Array(6)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 8)
}
