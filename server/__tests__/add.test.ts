import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Settings } from '../../shared/types.ts'
import { writeSetting } from '../lib/settings-store.ts'
import { authedClient, createApp, json } from './helpers.ts'
import type { ApiClient } from './helpers.ts'

async function token(api: ApiClient): Promise<string> {
  return (await json<Settings>(await api.get('/api/settings'))).bookmarkletToken
}

function hashParams(location: string): URLSearchParams {
  const index = location.indexOf('?')
  return new URLSearchParams(index === -1 ? '' : location.slice(index + 1))
}

describe('GET /add', () => {
  it('令牌正确时 302 到首页的 #add，并带上 url 与 title', async () => {
    const { deps, api } = await authedClient()
    const publicApp = createApp(deps)
    const value = await token(api)

    const response = await publicApp.request(
      `/add?token=${value}&url=${encodeURIComponent('https://example.com/page')}&title=${encodeURIComponent('示例 & 标题')}`,
    )

    assert.equal(response.status, 302)
    const location = response.headers.get('location') ?? ''
    assert.ok(location.startsWith('/#add?'), `Location 应以 /#add? 开头，实际为 ${location}`)

    const params = hashParams(location)
    assert.equal(params.get('url'), 'https://example.com/page')
    assert.equal(params.get('title'), '示例 & 标题', '标题里的特殊字符要能原样还原')
  })

  it('不带 url / title 时也能跳到 #add', async () => {
    const { deps, api } = await authedClient()
    const value = await token(api)

    const response = await createApp(deps).request(`/add?token=${value}`)
    assert.equal(response.status, 302)
    assert.equal(response.headers.get('location'), '/#add?')
  })

  it('令牌错误或缺失时返回 403，不跳转', async () => {
    const { deps } = await authedClient()
    const publicApp = createApp(deps)

    for (const url of ['/add', '/add?token=', '/add?token=wrong', '/add?token=wrong&url=https://a.com']) {
      const response = await publicApp.request(url)
      assert.equal(response.status, 403, url)
      assert.equal(response.headers.get('location'), null, '不该跳转')
    }
  })

  it('不需要登录即可访问（点击发生在任意第三方页面）', async () => {
    const { deps, api } = await authedClient()
    const value = await token(api)

    const response = await createApp(deps).request(`/add?token=${value}&url=https://a.example.com`)
    assert.equal(response.status, 302)
  })

  it('令牌被清空时，空 token 不能蒙混过关', async () => {
    const { deps } = await authedClient()
    // 模拟 settings 表被手改坏
    writeSetting(deps.db, 'bookmarkletToken', '')

    for (const url of ['/add', '/add?token=']) {
      const response = await createApp(deps).request(url)
      assert.equal(response.status, 403, url)
      assert.equal(response.headers.get('location'), null)
    }
  })
})
