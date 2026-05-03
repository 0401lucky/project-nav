import type { Env } from '../_types'
import { json, fail } from '../_lib/http'
import { signToken, timingSafeEqual } from '../_lib/auth'

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.EDIT_PASSWORD || !env.EDIT_SECRET) {
    return fail(503, '后端未配置 EDIT_PASSWORD / EDIT_SECRET')
  }

  let body: { password?: string }
  try {
    body = (await request.json()) as { password?: string }
  } catch {
    return fail(400, '请求体不是合法 JSON')
  }
  const password = (body?.password || '').trim()
  if (!password) return fail(400, '缺少密码')

  if (!(await timingSafeEqual(password, env.EDIT_PASSWORD))) {
    return fail(401, '密码错误')
  }

  const { token, expiresAt } = await signToken(env.EDIT_SECRET, TOKEN_TTL_MS)
  return json({ token, expiresAt })
}
