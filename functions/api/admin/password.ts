import type { Env } from '../../_types'
import { json, fail } from '../../_lib/http'
import { getBearer, verifyToken } from '../../_lib/auth'
import {
  readAdminSettings,
  writeAdminSettings,
  hashPassword,
  makeSalt,
  verifyAdminPassword,
} from '../../_lib/settings'

interface PostBody {
  oldPassword?: string
  newPassword?: string
}

// 修改/初始化编辑模式密码（写入 KV，覆盖环境变量）
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = getBearer(request)
  if (!(await verifyToken(env.EDIT_SECRET, token))) {
    return fail(401, '未授权')
  }

  let body: PostBody
  try {
    body = (await request.json()) as PostBody
  } catch {
    return fail(400, '请求体不是合法 JSON')
  }

  const oldPassword = (body.oldPassword || '').trim()
  const newPassword = (body.newPassword || '').trim()
  if (!newPassword) return fail(400, '缺少新密码')
  if (newPassword.length < 6) return fail(400, '新密码至少 6 位')
  if (newPassword.length > 128) return fail(400, '新密码过长')

  // 验证旧密码（KV 优先，回退到环境变量）
  if (!(await verifyAdminPassword(env, oldPassword))) {
    return fail(401, '原密码不正确')
  }

  const salt = makeSalt()
  const passwordHash = await hashPassword(newPassword, salt)
  const current = await readAdminSettings(env)
  await writeAdminSettings(env, {
    ...current,
    passwordHash,
    passwordSalt: salt,
    updatedAt: Date.now(),
  })

  return json({ ok: true })
}

// 清除自定义密码，回退到环境变量
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const token = getBearer(request)
  if (!(await verifyToken(env.EDIT_SECRET, token))) {
    return fail(401, '未授权')
  }
  if (!env.EDIT_PASSWORD) {
    return fail(400, '未设置环境变量密码，无法清除自定义密码（否则将无法登录）')
  }
  const current = await readAdminSettings(env)
  await writeAdminSettings(env, {
    ...current,
    passwordHash: null,
    passwordSalt: null,
    updatedAt: Date.now(),
  })
  return json({ ok: true })
}
