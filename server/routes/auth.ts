import { Hono } from 'hono'
import type { Context } from 'hono'
import {
  clearSessionCookie,
  clientIp,
  constantTimeEquals,
  createLoginGuard,
  setSessionCookie,
} from '../auth.ts'
import { badRequest, noContent, readJson } from '../lib/http.ts'
import type { AppDeps } from '../types.ts'

interface LoginBody {
  password?: unknown
}

export function authRoutes(deps: AppDeps): Hono {
  const app = new Hono()
  const guard = createLoginGuard(deps.db)

  app.post('/login', async (c) => {
    const ip = clientIp(c)

    const locked = guard.status(ip)
    if (locked.locked) return tooManyAttempts(c, locked.retryAfterSeconds)

    const body = await readJson<LoginBody>(c)
    if (body === null) return badRequest(c, '请求体必须是 JSON')
    const password = typeof body.password === 'string' ? body.password : ''

    if (!constantTimeEquals(password, deps.config.password)) {
      const after = guard.recordFailure(ip)
      if (after.locked) return tooManyAttempts(c, after.retryAfterSeconds)
      return c.json({ error: '密码错误' }, 401)
    }

    guard.clear(ip)
    setSessionCookie(c, deps.config.sessionSecret, deps.config.secureCookies)
    return noContent(c)
  })

  app.post('/logout', (c) => {
    clearSessionCookie(c, deps.config.secureCookies)
    return noContent(c)
  })

  return app
}

function tooManyAttempts(c: Context, retryAfterSeconds: number): Response {
  c.header('Retry-After', String(retryAfterSeconds))
  return c.json(
    {
      error: '尝试次数过多，请稍后再试',
      detail: `请等待约 ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} 分钟`,
    },
    429,
  )
}
