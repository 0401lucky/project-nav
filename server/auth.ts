import { createHmac, timingSafeEqual } from 'node:crypto'
import { getConnInfo } from '@hono/node-server/conninfo'
import { setCookie, deleteCookie, getCookie } from 'hono/cookie'
import type { Context, MiddlewareHandler } from 'hono'
import { execute, queryOne } from './lib/query.ts'
import type { Db } from './types.ts'

export const SESSION_COOKIE = 'nav_session'
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000
export const MAX_LOGIN_FAILS = 5
export const LOCK_MS = 10 * 60 * 1000

export interface Session {
  expiresAt: number
}

/**
 * Cookie 值 = base64url(expiresAt) + '.' + HMAC-SHA256(SESSION_SECRET, payload)。
 * 服务端只签过期时间：单人站点没有更多需要绑定的身份信息，
 * 改动过期时间会导致签名校验失败。
 */
export function signSession(secret: string, expiresAt: number): string {
  const payload = Buffer.from(String(expiresAt), 'utf8').toString('base64url')
  return `${payload}.${sign(secret, payload)}`
}

export function verifySession(
  secret: string,
  token: string | undefined,
  now = Date.now(),
): Session | null {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  if (!constantTimeEquals(signature, sign(secret, payload))) return null

  const expiresAt = Number(Buffer.from(payload, 'base64url').toString('utf8'))
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return null
  return { expiresAt }
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('base64url')
}

/** 先各自摘要再定时比较，长度不同也不会提前返回，避免泄露长度信息 */
export function constantTimeEquals(a: string, b: string): boolean {
  const left = createHmac('sha256', 'compare').update(a, 'utf8').digest()
  const right = createHmac('sha256', 'compare').update(b, 'utf8').digest()
  return timingSafeEqual(left, right)
}

export interface LockStatus {
  locked: boolean
  retryAfterSeconds: number
}

export interface LoginGuard {
  status(ip: string, now?: number): LockStatus
  recordFailure(ip: string, now?: number): LockStatus
  clear(ip: string): void
}

interface AttemptRow {
  fails: number
  locked_until: number | null
}

/**
 * 按来源 IP 计数的登录锁定。
 * 锁定期内不再累计；锁定期结束后从零重新计数（否则每失败一次就再过 10 分钟解锁不了）。
 */
export function createLoginGuard(
  db: Db,
  maxFails: number = MAX_LOGIN_FAILS,
  lockMs: number = LOCK_MS,
): LoginGuard {
  function read(ip: string): AttemptRow | undefined {
    return queryOne<AttemptRow>(
      db,
      'SELECT fails, locked_until FROM login_attempts WHERE ip = ?',
      ip,
    )
  }

  function lockStatus(lockedUntil: number | null, now: number): LockStatus {
    if (lockedUntil === null || lockedUntil <= now) {
      return { locked: false, retryAfterSeconds: 0 }
    }
    return { locked: true, retryAfterSeconds: Math.ceil((lockedUntil - now) / 1000) }
  }

  return {
    status(ip, now = Date.now()) {
      return lockStatus(read(ip)?.locked_until ?? null, now)
    },

    recordFailure(ip, now = Date.now()) {
      const row = read(ip)
      const previousLock = row?.locked_until ?? null
      // 上一次锁定已经过期就从零重新计数，否则沿用累计失败次数
      const previous = previousLock !== null && previousLock <= now ? 0 : (row?.fails ?? 0)
      const fails = previous + 1
      const lockedUntil = fails >= maxFails ? now + lockMs : null

      execute(
        db,
        `INSERT INTO login_attempts (ip, fails, locked_until) VALUES (?, ?, ?)
         ON CONFLICT(ip) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until`,
        ip,
        fails,
        lockedUntil,
      )
      return lockStatus(lockedUntil, now)
    },

    clear(ip) {
      execute(db, 'DELETE FROM login_attempts WHERE ip = ?', ip)
    },
  }
}

export function setSessionCookie(
  c: Context,
  secret: string,
  secure: boolean,
  now = Date.now(),
): number {
  const expiresAt = now + SESSION_TTL_MS
  setCookie(c, SESSION_COOKIE, signSession(secret, expiresAt), {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    secure,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
  return expiresAt
}

export function clearSessionCookie(c: Context, secure: boolean): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure })
}

export function requireAuth(secret: string): MiddlewareHandler {
  return async (c, next) => {
    if (!verifySession(secret, getCookie(c, SESSION_COOKIE))) {
      return c.json({ error: '未登录' }, 401)
    }
    await next()
  }
}

/**
 * 取来源地址。用 socket 真实地址而不是 X-Forwarded-For：
 * 后者可被客户端随意伪造，会让"连错 5 次锁定"形同虚设。
 * 代价是反向代理后所有请求同 IP，但这是单人站点，锁定语义依然正确。
 */
export function clientIp(c: Context): string {
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}
