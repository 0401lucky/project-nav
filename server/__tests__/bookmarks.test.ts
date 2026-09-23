import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Bookmark, BootstrapResponse, Group } from '../../shared/types.ts'
import { authedClient, json } from './helpers.ts'
import type { ApiClient } from './helpers.ts'

async function setup(): Promise<{ api: ApiClient; groupId: string }> {
  const { api } = await authedClient()
  const boot = await json<BootstrapResponse>(await api.get('/api/bootstrap'))
  return { api, groupId: boot.groups[0]!.id }
}

async function bookmarksIn(api: ApiClient, groupId: string): Promise<Bookmark[]> {
  const boot = await json<BootstrapResponse>(await api.get('/api/bootstrap'))
  return boot.bookmarks.filter((item) => item.groupId === groupId)
}

async function addBookmark(api: ApiClient, groupId: string, title: string, url: string): Promise<Bookmark> {
  return json<Bookmark>(await api.post('/api/bookmarks', { groupId, title, url }))
}

describe('POST /api/bookmarks', () => {
  it('新增书签并追加到组内末尾', async () => {
    const { api, groupId } = await setup()

    const first = await addBookmark(api, groupId, '第一', 'https://one.example.com')
    const second = await addBookmark(api, groupId, '第二', 'https://two.example.com')

    assert.equal(first.sortOrder, 1024)
    assert.equal(second.sortOrder, 2048)
    assert.equal(first.hasIcon, false, '新书签还没有本地图标')
    assert.equal(first.description, null)
  })

  it('裸域名会自动补上 https://', async () => {
    const { api, groupId } = await setup()
    const bookmark = await json<Bookmark>(
      await api.post('/api/bookmarks', { groupId, title: 'GitHub', url: 'github.com' }),
    )
    assert.equal(bookmark.url, 'https://github.com')
  })

  it('非法网址返回 400', async () => {
    const { api, groupId } = await setup()
    for (const url of ['', '   ', 'not a url', 'ftp://example.com', 'javascript:alert(1)']) {
      const response = await api.post('/api/bookmarks', { groupId, title: 'x', url })
      assert.equal(response.status, 400, `url=${url} 应被拒绝`)
    }
  })

  it('目标分组不存在返回 400', async () => {
    const { api } = await setup()
    const response = await api.post('/api/bookmarks', {
      groupId: 'nope',
      title: 'x',
      url: 'https://example.com',
    })
    assert.equal(response.status, 400)
  })

  it('标题为空或超长返回 400', async () => {
    const { api, groupId } = await setup()
    const base = { groupId, url: 'https://example.com' }
    assert.equal((await api.post('/api/bookmarks', { ...base, title: '  ' })).status, 400)
    assert.equal((await api.post('/api/bookmarks', { ...base, title: 'x'.repeat(201) })).status, 400)
  })

  it('描述可选，超长返回 400', async () => {
    const { api, groupId } = await setup()
    const base = { groupId, title: 'x', url: 'https://example.com' }

    const withDescription = await json<Bookmark>(
      await api.post('/api/bookmarks', { ...base, description: '一句话说明' }),
    )
    assert.equal(withDescription.description, '一句话说明')

    assert.equal(
      (await api.post('/api/bookmarks', { ...base, description: 'x'.repeat(1001) })).status,
      400,
    )
  })
})

describe('PATCH /api/bookmarks/:id', () => {
  it('改标题、网址与描述', async () => {
    const { api, groupId } = await setup()
    const created = await addBookmark(api, groupId, '旧标题', 'https://old.example.com')

    const updated = await json<Bookmark>(
      await api.patch(`/api/bookmarks/${created.id}`, {
        title: '新标题',
        url: 'https://new.example.com',
        description: '新描述',
      }),
    )
    assert.equal(updated.title, '新标题')
    assert.equal(updated.url, 'https://new.example.com')
    assert.equal(updated.description, '新描述')
    assert.equal(updated.sortOrder, created.sortOrder, '改内容不动顺序')
  })

  it('只传部分字段时其余保持原样', async () => {
    const { api, groupId } = await setup()
    const created = await json<Bookmark>(
      await api.post('/api/bookmarks', {
        groupId,
        title: '原题',
        url: 'https://example.com',
        description: '原描述',
      }),
    )

    const updated = await json<Bookmark>(await api.patch(`/api/bookmarks/${created.id}`, { title: '新题' }))
    assert.equal(updated.url, 'https://example.com')
    assert.equal(updated.description, '原描述')
  })

  it('传 null 可以清空描述', async () => {
    const { api, groupId } = await setup()
    const created = await json<Bookmark>(
      await api.post('/api/bookmarks', {
        groupId,
        title: 'x',
        url: 'https://example.com',
        description: '有描述',
      }),
    )
    const updated = await json<Bookmark>(
      await api.patch(`/api/bookmarks/${created.id}`, { description: null }),
    )
    assert.equal(updated.description, null)
  })

  it('换分组时追加到目标分组末尾', async () => {
    const { api, groupId } = await setup()
    const target = await json<Group>(await api.post('/api/groups', { name: '目标' }))
    await addBookmark(api, target.id, '目标原有', 'https://a.example.com')

    const moving = await addBookmark(api, groupId, '要搬家', 'https://b.example.com')
    const moved = await json<Bookmark>(
      await api.patch(`/api/bookmarks/${moving.id}`, { groupId: target.id }),
    )

    assert.equal(moved.groupId, target.id)
    assert.equal(moved.sortOrder, 2048, '应追加在目标分组原有书签之后')
    assert.deepEqual((await bookmarksIn(api, target.id)).map((item) => item.title), [
      '目标原有',
      '要搬家',
    ])
  })

  it('换到不存在的分组返回 400，书签不存在返回 404', async () => {
    const { api, groupId } = await setup()
    const created = await addBookmark(api, groupId, 'x', 'https://example.com')

    assert.equal((await api.patch(`/api/bookmarks/${created.id}`, { groupId: 'nope' })).status, 400)
    assert.equal((await api.patch('/api/bookmarks/nope', { title: 'x' })).status, 404)
  })
})

describe('DELETE /api/bookmarks/:id', () => {
  it('删掉后不再出现在快照里，重复删除返回 404', async () => {
    const { api, groupId } = await setup()
    const created = await addBookmark(api, groupId, 'x', 'https://example.com')

    assert.equal((await api.del(`/api/bookmarks/${created.id}`)).status, 204)
    assert.deepEqual(await bookmarksIn(api, groupId), [])
    assert.equal((await api.del(`/api/bookmarks/${created.id}`)).status, 404)
  })
})

describe('PUT /api/bookmarks/order', () => {
  it('组内重排并整体重编号', async () => {
    const { api, groupId } = await setup()
    const a = await addBookmark(api, groupId, 'A', 'https://a.example.com')
    const b = await addBookmark(api, groupId, 'B', 'https://b.example.com')
    const c = await addBookmark(api, groupId, 'C', 'https://c.example.com')

    const response = await api.put('/api/bookmarks/order', {
      groupId,
      ids: [c.id, a.id, b.id],
    })
    assert.equal(response.status, 204)

    const ordered = await bookmarksIn(api, groupId)
    assert.deepEqual(ordered.map((item) => item.title), ['C', 'A', 'B'])
    assert.deepEqual(ordered.map((item) => item.sortOrder), [1024, 2048, 3072])
  })

  it('把别组的书签带进 ids 就是跨组移动', async () => {
    const { api, groupId } = await setup()
    const target = await json<Group>(await api.post('/api/groups', { name: '目标' }))
    const stay = await addBookmark(api, target.id, '留下的', 'https://a.example.com')
    const moving = await addBookmark(api, groupId, '搬走的', 'https://b.example.com')

    const response = await api.put('/api/bookmarks/order', {
      groupId: target.id,
      ids: [stay.id, moving.id],
    })
    assert.equal(response.status, 204)

    assert.deepEqual((await bookmarksIn(api, target.id)).map((item) => item.title), [
      '留下的',
      '搬走的',
    ])
    assert.deepEqual(await bookmarksIn(api, groupId), [], '原分组已空')
  })

  it('漏掉该组现有书签返回 400', async () => {
    const { api, groupId } = await setup()
    const a = await addBookmark(api, groupId, 'A', 'https://a.example.com')
    await addBookmark(api, groupId, 'B', 'https://b.example.com')

    const response = await api.put('/api/bookmarks/order', { groupId, ids: [a.id] })
    assert.equal(response.status, 400)
  })

  it('未知书签 id 返回 404，分组不存在返回 404', async () => {
    const { api, groupId } = await setup()
    const a = await addBookmark(api, groupId, 'A', 'https://a.example.com')

    assert.equal(
      (await api.put('/api/bookmarks/order', { groupId, ids: [a.id, 'nope'] })).status,
      404,
    )
    assert.equal((await api.put('/api/bookmarks/order', { groupId: 'nope', ids: [] })).status, 404)
  })

  it('含重复 id 返回 400', async () => {
    const { api, groupId } = await setup()
    const a = await addBookmark(api, groupId, 'A', 'https://a.example.com')

    assert.equal(
      (await api.put('/api/bookmarks/order', { groupId, ids: [a.id, a.id] })).status,
      400,
    )
  })
})

describe('校验必须发生在写库之前', () => {
  it('POST 的 iconUrl 非法时返回 400 且不写库', async () => {
    const { api, groupId } = await setup()
    const before = (await bookmarksIn(api, groupId)).length

    const response = await api.post('/api/bookmarks', {
      groupId,
      title: '不该被创建',
      url: 'https://example.com',
      iconUrl: 123,
    })

    assert.equal(response.status, 400)
    assert.equal(
      (await bookmarksIn(api, groupId)).length,
      before,
      '前端拿到 400 会回滚乐观状态，服务端留下半条数据就不一致了',
    )
  })

  it('PATCH 的 iconUrl 非法时返回 400 且不改动任何字段', async () => {
    const { api, groupId } = await setup()
    const created = await addBookmark(api, groupId, '原标题', 'https://example.com')

    const response = await api.patch(`/api/bookmarks/${created.id}`, {
      title: '被改掉的标题',
      iconUrl: 123,
    })

    assert.equal(response.status, 400)
    const after = (await bookmarksIn(api, groupId))[0]!
    assert.equal(after.title, '原标题', '校验失败不能让前面的字段改动生效')
  })
})

describe('updatedAt', () => {
  it('新增时带上，修改后变大', async () => {
    const { api, groupId } = await setup()
    const created = await addBookmark(api, groupId, '标题', 'https://example.com')
    assert.ok(Number.isFinite(created.updatedAt) && created.updatedAt > 0)

    await new Promise((resolve) => setTimeout(resolve, 5))
    const updated = await json<Bookmark>(
      await api.patch(`/api/bookmarks/${created.id}`, { title: '新标题' }),
    )
    assert.ok(updated.updatedAt > created.updatedAt, '前端拿 ?v=updatedAt 当图标缓存键')
  })

  it('换分组也刷新 updatedAt', async () => {
    const { api, groupId } = await setup()
    const target = await json<Group>(await api.post('/api/groups', { name: '目标' }))
    const created = await addBookmark(api, groupId, '标题', 'https://example.com')

    await new Promise((resolve) => setTimeout(resolve, 5))
    const moved = await json<Bookmark>(
      await api.patch(`/api/bookmarks/${created.id}`, { groupId: target.id }),
    )
    assert.ok(moved.updatedAt > created.updatedAt)
  })
})
