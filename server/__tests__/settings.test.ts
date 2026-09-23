import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Settings } from '../../shared/types.ts'
import { authedClient, createApp, json } from './helpers.ts'

describe('GET /api/settings', () => {
  it('返回默认设置', async () => {
    const { api } = await authedClient()
    const settings = await json<Settings>(await api.get('/api/settings'))

    assert.equal(settings.wallpaper, '')
    assert.equal(settings.accent, '#e8c87a')
    assert.equal(settings.searchEngine.name, 'Google')
    assert.match(settings.searchEngine.template, /%s/)
    assert.match(settings.bookmarkletToken, /^[0-9a-f]{64}$/)
  })
})

describe('PATCH /api/settings', () => {
  it('改强调色并持久化', async () => {
    const { api } = await authedClient()
    const updated = await json<Settings>(await api.patch('/api/settings', { accent: '#7fd1ae' }))
    assert.equal(updated.accent, '#7fd1ae')

    const reread = await json<Settings>(await api.get('/api/settings'))
    assert.equal(reread.accent, '#7fd1ae')
  })

  it('强调色格式非法返回 400', async () => {
    const { api } = await authedClient()
    for (const accent of ['red', '#fff', '#gggggg', '']) {
      assert.equal((await api.patch('/api/settings', { accent })).status, 400, `accent=${accent}`)
    }
  })

  it('搜索引擎模板缺少 %s 返回 400', async () => {
    const { api } = await authedClient()
    const response = await api.patch('/api/settings', {
      searchEngine: { name: 'Bing', template: 'https://www.bing.com/search?q=' },
    })
    assert.equal(response.status, 400)
  })

  it('搜索引擎可以换成自定义模板', async () => {
    const { api } = await authedClient()
    const settings = await json<Settings>(
      await api.patch('/api/settings', {
        searchEngine: { name: 'DuckDuckGo', template: 'https://duckduckgo.com/?q=%s' },
      }),
    )
    assert.equal(settings.searchEngine.name, 'DuckDuckGo')
    assert.equal(settings.searchEngine.template, 'https://duckduckgo.com/?q=%s')
  })

  it('bookmarkletToken 只读，改了也不生效', async () => {
    const { api } = await authedClient()
    const before = await json<Settings>(await api.get('/api/settings'))

    const after = await json<Settings>(
      await api.patch('/api/settings', { bookmarkletToken: 'attacker-chosen-token' }),
    )
    assert.equal(after.bookmarkletToken, before.bookmarkletToken)
  })

  it('壁纸 id 限制字符集，非法值返回 400', async () => {
    const { api } = await authedClient()
    for (const wallpaper of ['../etc/passwd', 'a/b', 'x'.repeat(65), '有中文']) {
      assert.equal(
        (await api.patch('/api/settings', { wallpaper })).status,
        400,
        `wallpaper=${wallpaper}`,
      )
    }
  })

  it('壁纸可以设置成合法 id，也可以清空', async () => {
    const { api } = await authedClient()

    assert.equal(
      (await json<Settings>(await api.patch('/api/settings', { wallpaper: 'w-01' }))).wallpaper,
      'w-01',
    )
    assert.equal((await json<Settings>(await api.patch('/api/settings', { wallpaper: '' }))).wallpaper, '')
  })

  it('未提供的字段保持原样', async () => {
    const { api } = await authedClient()
    await api.patch('/api/settings', { accent: '#123456' })
    const settings = await json<Settings>(await api.patch('/api/settings', { wallpaper: 'w-02' }))
    assert.equal(settings.accent, '#123456')
  })
})

describe('设置接口的鉴权', () => {
  it('未登录返回 401', async () => {
    const { deps } = await authedClient()
    const anonymous = createApp(deps)

    assert.equal((await anonymous.request('/api/settings')).status, 401)
    assert.equal((await anonymous.request('/api/settings', { method: 'PATCH' })).status, 401)
  })
})
