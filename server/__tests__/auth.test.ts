import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createLoginGuard,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  signSession,
  verifySession,
} from '../auth.ts'
import { createDb } from '../db.ts'
import { cookiePair, createApp, jsonPost, TEST_PASSWORD, TEST_SECRET, testDeps } from './helpers.ts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('会话签名', () => {
  it('签发后能校验回来', () => {
    const now = Date.now()
    const expiresAt = now + SESSION_TTL_MS
    const session = verifySession(TEST_SECRET, signSession(TEST_SECRET, expiresAt), now)
    assert.equal(session?.expiresAt, expiresAt)
  })

  it('改动过期时间后签名失效', () => {
    const now = Date.now()
    const token = signSession(TEST_SECRET, now + SESSION_TTL_MS)
    const payload = token.slice(0, token.lastIndexOf('.'))
    const forgedPayload = Buffer.from(String(now + 365 * DAY_MS), 'utf8').toString('base64url')
    const forged = `${forgedPayload}.${token.slice(token.lastIndexOf('.') + 1)}`

    assert.equal(verifySession(TEST_SECRET, forged, now), null)
    assert.equal(verifySession(TEST_SECRET, payload, now), null, '缺少签名段也应为 null')
  })

  it('过期后失效', () => {
    const now = Date.now()
    const token = signSession(TEST_SECRET, now + SESSION_TTL_MS)
    assert.notEqual(verifySession(TEST_SECRET, token, now), null)
    // expiresAt 是排他上界：到点即失效
    assert.notEqual(verifySession(TEST_SECRET, token, now + SESSION_TTL_MS - 1), null)
    assert.equal(verifySession(TEST_SECRET, token, now + SESSION_TTL_MS), null)
  })

  it('换了密钥就失效', () => {
    const now = Date.now()
    const token = signSession(TEST_SECRET, now + SESSION_TTL_MS)
    assert.equal(verifySession('another-secret-that-is-long-enough-ok', token, now), null)
  })

  it('空值与垃圾值返回 null', () => {
    const now = Date.now()
    assert.equal(verifySession(TEST_SECRET, undefined, now), null)
    assert.equal(verifySession(TEST_SECRET, '', now), null)
    assert.equal(verifySession(TEST_SECRET, 'nodot', now), null)
    assert.equal(verifySession(TEST_SECRET, '.sig', now), null)
  })
})

describe('登录锁定计数', () => {
  const LOCK_MS = 10 * 60 * 1000
  const START = 1_700_000_000_000

  it('连错 5 次后锁定，锁定期满后从零重新计数', () => {
    const guard = createLoginGuard(createDb(':memory:'), 5, LOCK_MS)

    for (let i = 1; i <= 4; i += 1) {
      assert.equal(guard.recordFailure('1.2.3.4', START).locked, false, `第 ${i} 次不应锁定`)
    }
    const locked = guard.recordFailure('1.2.3.4', START)
    assert.equal(locked.locked, true)
    assert.equal(locked.retryAfterSeconds, LOCK_MS / 1000)

    // 锁定期内状态查询也是锁定
    assert.equal(guard.status('1.2.3.4', START + 1000).locked, true)

    // 锁定期满：解锁，且之前累计的次数不再叠加
    assert.equal(guard.status('1.2.3.4', START + LOCK_MS + 1).locked, false)
    for (let i = 1; i <= 4; i += 1) {
      assert.equal(
        guard.recordFailure('1.2.3.4', START + LOCK_MS + 1).locked,
        false,
        `解锁后第 ${i} 次不应立刻锁定`,
      )
    }
    assert.equal(guard.recordFailure('1.2.3.4', START + LOCK_MS + 1).locked, true)
  })

  it('按 IP 分别计数，互不影响', () => {
    const guard = createLoginGuard(createDb(':memory:'), 5, LOCK_MS)
    for (let i = 0; i < 5; i += 1) guard.recordFailure('1.1.1.1', START)

    assert.equal(guard.status('1.1.1.1', START).locked, true)
    assert.equal(guard.status('2.2.2.2', START).locked, false)
  })

  it('清除后计数归零', () => {
    const guard = createLoginGuard(createDb(':memory:'), 5, LOCK_MS)
    for (let i = 0; i < 5; i += 1) guard.recordFailure('1.1.1.1', START)
    guard.clear('1.1.1.1')

    assert.equal(guard.status('1.1.1.1', START).locked, false)
    assert.equal(guard.recordFailure('1.1.1.1', START).locked, false)
  })
})

describe('POST /api/auth/login', () => {
  it('密码正确返回 204 并下发长期 HttpOnly Cookie', async () => {
    const app = createApp(testDeps())
    const response = await app.request('/api/auth/login', jsonPost({ password: TEST_PASSWORD }))

    assert.equal(response.status, 204)
    const raw = response.headers.get('set-cookie') ?? ''
    assert.ok(raw.startsWith(`${SESSION_COOKIE}=`), `Set-Cookie 应以 ${SESSION_COOKIE} 开头`)
    assert.match(raw, /HttpOnly/i)
    assert.match(raw, /SameSite=Lax/i)
    assert.match(raw, new RegExp(`Max-Age=${SESSION_TTL_MS / 1000}`))
    assert.ok(!/Secure/i.test(raw), '非生产环境不应加 Secure，否则 http 下登录不上')
  })

  it('密码错误返回 401', async () => {
    const app = createApp(testDeps())
    const response = await app.request('/api/auth/login', jsonPost({ password: 'nope' }))
    assert.equal(response.status, 401)
    assert.equal(response.headers.get('set-cookie'), null)
  })

  it('请求体不是合法 JSON 返回 400', async () => {
    const app = createApp(testDeps())
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    })
    assert.equal(response.status, 400)
  })

  it('连错 5 次后返回 429 并带 Retry-After，此时正确密码也被拒', async () => {
    const app = createApp(testDeps())

    for (let i = 1; i <= 4; i += 1) {
      const response = await app.request('/api/auth/login', jsonPost({ password: 'nope' }))
      assert.equal(response.status, 401, `第 ${i} 次错误应是 401`)
    }

    const fifth = await app.request('/api/auth/login', jsonPost({ password: 'nope' }))
    assert.equal(fifth.status, 429, '第 5 次错误即触发锁定')
    assert.equal(fifth.headers.get('retry-after'), '600')

    const correct = await app.request('/api/auth/login', jsonPost({ password: TEST_PASSWORD }))
    assert.equal(correct.status, 429, '锁定期内即使密码正确也拒绝')
  })

  it('成功登录会清空之前的失败计数', async () => {
    const deps = testDeps()
    const app = createApp(deps)

    for (let i = 0; i < 3; i += 1) {
      await app.request('/api/auth/login', jsonPost({ password: 'nope' }))
    }
    const ok = await app.request('/api/auth/login', jsonPost({ password: TEST_PASSWORD }))
    assert.equal(ok.status, 204)

    for (let i = 1; i <= 4; i += 1) {
      const response = await app.request('/api/auth/login', jsonPost({ password: 'nope' }))
      assert.equal(response.status, 401, '计数已归零，第 4 次仍不应锁定')
    }
  })
})

describe('POST /api/auth/logout', () => {
  it('清掉会话 Cookie', async () => {
    const deps = testDeps()
    const app = createApp(deps)
    const cookie = await app.request('/api/auth/login', jsonPost({ password: TEST_PASSWORD }))

    const response = await app.request('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: cookiePair(cookie) },
    })
    assert.equal(response.status, 204)
    assert.match(response.headers.get('set-cookie') ?? '', new RegExp(`^${SESSION_COOKIE}=;`))
  })
})
