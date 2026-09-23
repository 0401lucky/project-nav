import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { signSession } from '../auth.ts'
import type { BootstrapResponse } from '../../shared/types.ts'
import { createApp, login, TEST_SECRET, testDeps } from './helpers.ts'

describe('GET /api/bootstrap', () => {
  it('未登录返回 401', async () => {
    const app = createApp(testDeps())
    const response = await app.request('/api/bootstrap')

    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: '未登录' })
  })

  it('伪造的 Cookie 返回 401', async () => {
    const app = createApp(testDeps())
    const response = await app.request('/api/bootstrap', {
      headers: { Cookie: 'nav_session=aaaa.bbbb' },
    })
    assert.equal(response.status, 401)
  })

  it('过期的 Cookie 返回 401', async () => {
    const app = createApp(testDeps())
    const expired = signSession(TEST_SECRET, Date.now() - 1000)
    const response = await app.request('/api/bootstrap', {
      headers: { Cookie: `nav_session=${expired}` },
    })
    assert.equal(response.status, 401)
  })

  it('登录后返回完整的全量快照', async () => {
    const deps = testDeps()
    const cookie = await login(deps)
    const app = createApp(deps)

    const response = await app.request('/api/bootstrap', { headers: { Cookie: cookie } })
    assert.equal(response.status, 200)

    const body = (await response.json()) as BootstrapResponse
    assert.equal(body.groups.length, 1)
    assert.equal(body.groups[0]!.name, '常用')
    assert.equal(body.groups[0]!.icon, '⭐')
    assert.deepEqual(body.bookmarks, [])
    assert.deepEqual(body.wallpapers, [])
    assert.deepEqual(Object.keys(body.settings).sort(), [
      'accent',
      'bookmarkletToken',
      'searchEngine',
      'wallpaper',
    ])
  })
})

describe('/api/* 鉴权中间件', () => {
  it('除 /api/auth/* 之外一律要求登录', async () => {
    const app = createApp(testDeps())

    for (const path of ['/api/bootstrap', '/api/groups', '/api/not-registered']) {
      const response = await app.request(path)
      assert.equal(response.status, 401, `${path} 应返回 401`)
    }
  })
})
