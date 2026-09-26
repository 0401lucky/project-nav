import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import sharp from 'sharp'
import type { Bookmark, BootstrapResponse, IconRefreshResponse, MissingIconReport } from '../../shared/types.ts'
import { apiClient, cleanupTempDirs, json, login, tempDeps, withServer } from './helpers.ts'
import type { ApiClient } from './helpers.ts'

async function setup(url: string): Promise<{ api: ApiClient; bookmark: Bookmark }> {
  const deps = tempDeps()
  const api = apiClient(deps, await login(deps))
  const boot = await json<BootstrapResponse>(await api.get('/api/bootstrap'))
  const groupId = boot.groups[0]!.id
  const bookmark = await json<Bookmark>(await api.post('/api/bookmarks', { groupId, title: '站点', url, iconUrl: null }))
  return { api, bookmark }
}

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 32, height: 32, channels: 3, background: '#48c' } }).png().toBuffer()
}

after(cleanupTempDirs)

describe('书签图标接口', () => {
  it('GET /:id 返回单条书签，不存在时 404', async () => {
    const { api, bookmark } = await setup('https://example.com')
    assert.equal((await json<Bookmark>(await api.get(`/api/bookmarks/${bookmark.id}`))).id, bookmark.id)
    assert.equal((await api.get('/api/bookmarks/nope')).status, 404)
  })

  it('重新抓取成功后返回 hasIcon=true 的书签', async () => {
    const image = await png()
    await withServer(
      (res, req) => {
        if (req.url === '/i.png') {
          res.writeHead(200, { 'Content-Type': 'image/png' })
          res.end(image)
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<link rel="icon" href="/i.png">')
      },
      async (base) => {
        const { api, bookmark } = await setup(base)
        const body = await json<IconRefreshResponse>(await api.post(`/api/bookmarks/${bookmark.id}/icon/refetch`))
        assert.equal(body.error, undefined)
        assert.equal(body.bookmark.hasIcon, true)
      },
    )
  })

  it('重新抓取失败时带回原因，不改图标状态', async () => {
    await withServer(
      (res) => {
        res.writeHead(404)
        res.end()
      },
      async (base) => {
        const { api, bookmark } = await setup(base)
        const body = await json<IconRefreshResponse>(await api.post(`/api/bookmarks/${bookmark.id}/icon/refetch`))
        assert.equal(body.error, '页面不存在（HTTP 404）')
        assert.equal(body.bookmark.hasIcon, false)
      },
    )
  })

  it('上传图片作为图标；非图片给出原因', async () => {
    const { api, bookmark } = await setup('https://example.com')
    const form = new FormData()
    form.set('file', new File([new Uint8Array(await png())], 'a.png', { type: 'image/png' }))
    const ok = await json<IconRefreshResponse>(await api.put(`/api/bookmarks/${bookmark.id}/icon`, form))
    assert.equal(ok.bookmark.hasIcon, true)

    const bad = new FormData()
    bad.set('file', new File(['hello'], 'a.txt', { type: 'text/plain' }))
    const failed = await json<IconRefreshResponse>(await api.put(`/api/bookmarks/${bookmark.id}/icon`, bad))
    assert.equal(failed.error, '返回的内容不是图片')
    assert.equal(failed.bookmark.hasIcon, true, '失败不抹掉已有图标')
  })

  it('批量补抓返回统计', async () => {
    const { api } = await setup('http://127.0.0.1:9/')
    const report = await json<MissingIconReport>(await api.post('/api/bookmarks/icons/refetch-missing'))
    assert.equal(report.total, 1)
    assert.equal(report.failed.length, 1)
  })
})
