import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Bookmark, BootstrapResponse, Group } from '../../shared/types.ts'
import { authedClient, createApp, json } from './helpers.ts'
import type { ApiClient } from './helpers.ts'

const NEW_GROUP = { name: '开发工具', icon: '🛠️' }

async function defaultGroupId(api: ApiClient): Promise<string> {
  const boot = await json<BootstrapResponse>(await api.get('/api/bootstrap'))
  return boot.groups[0]!.id
}

async function groupNames(api: ApiClient): Promise<string[]> {
  const boot = await json<BootstrapResponse>(await api.get('/api/bootstrap'))
  return boot.groups.map((group) => group.name)
}

describe('POST /api/groups', () => {
  it('新增分组并追加到末尾', async () => {
    const { api } = await authedClient()

    const created = await json<Group>(await api.post('/api/groups', NEW_GROUP))
    assert.equal(created.name, NEW_GROUP.name)
    assert.equal(created.icon, NEW_GROUP.icon)
    assert.equal(created.sortOrder, 2048, '默认分组占 1024，新增应为 2048')
    assert.ok(created.id.length > 0)

    assert.deepEqual(await groupNames(api), ['常用', '开发工具'])
  })

  it('图标可省略', async () => {
    const { api } = await authedClient()
    const created = await json<Group>(await api.post('/api/groups', { name: '无图标' }))
    assert.equal(created.icon, null)
  })

  it('名称为空或全是空白返回 400', async () => {
    const { api } = await authedClient()
    for (const name of ['', '   ', undefined, 123]) {
      const response = await api.post('/api/groups', { name })
      assert.equal(response.status, 400, `name=${String(name)} 应被拒绝`)
    }
  })

  it('名称超过上限返回 400', async () => {
    const { api } = await authedClient()
    const response = await api.post('/api/groups', { name: 'x'.repeat(41) })
    assert.equal(response.status, 400)
  })
})

describe('PATCH /api/groups/:id', () => {
  it('改名字与图标', async () => {
    const { api } = await authedClient()
    const id = await defaultGroupId(api)

    const updated = await json<Group>(await api.patch(`/api/groups/${id}`, { name: '日常', icon: '☕' }))
    assert.equal(updated.name, '日常')
    assert.equal(updated.icon, '☕')
    assert.equal(updated.id, id)
  })

  it('只改名字时图标保持原样', async () => {
    const { api } = await authedClient()
    const id = await defaultGroupId(api)

    const updated = await json<Group>(await api.patch(`/api/groups/${id}`, { name: '日常' }))
    assert.equal(updated.icon, '⭐')
  })

  it('传空字符串可以清掉图标', async () => {
    const { api } = await authedClient()
    const id = await defaultGroupId(api)

    const updated = await json<Group>(await api.patch(`/api/groups/${id}`, { icon: '' }))
    assert.equal(updated.icon, null)
  })

  it('分组不存在返回 404', async () => {
    const { api } = await authedClient()
    assert.equal((await api.patch('/api/groups/nope', { name: 'x' })).status, 404)
  })
})

describe('DELETE /api/groups/:id', () => {
  it('不带 moveTo 时连同组内书签一起删掉', async () => {
    const { api } = await authedClient()
    const id = await defaultGroupId(api)
    await api.post('/api/bookmarks', { groupId: id, title: '示例', url: 'https://example.com' })

    assert.equal((await api.del(`/api/groups/${id}`)).status, 204)

    const boot = await json<BootstrapResponse>(await api.get('/api/bootstrap'))
    assert.deepEqual(boot.groups, [])
    assert.deepEqual(boot.bookmarks, [], '外键级联应带走组内书签')
  })

  it('带 moveTo 时书签迁移到目标分组并追加在末尾', async () => {
    const { api } = await authedClient()
    const from = await defaultGroupId(api)
    const to = await json<Group>(await api.post('/api/groups', { name: '目标' }))

    await api.post('/api/bookmarks', { groupId: to.id, title: '原有', url: 'https://a.example.com' })
    await api.post('/api/bookmarks', { groupId: from, title: '迁入一', url: 'https://b.example.com' })
    await api.post('/api/bookmarks', { groupId: from, title: '迁入二', url: 'https://c.example.com' })

    assert.equal((await api.del(`/api/groups/${from}?moveTo=${to.id}`)).status, 204)

    const boot = await json<BootstrapResponse>(await api.get('/api/bootstrap'))
    assert.deepEqual(boot.groups.map((group) => group.id), [to.id])
    const moved = boot.bookmarks
    assert.deepEqual(moved.map((item) => item.title), ['原有', '迁入一', '迁入二'])
    assert.ok(moved.every((item) => item.groupId === to.id))
    assert.deepEqual(
      moved.map((item) => item.sortOrder),
      [1024, 2048, 3072],
      '迁移后应整体重编号，原有书签在前',
    )
  })

  it('moveTo 指向自己或不存在返回 400', async () => {
    const { api } = await authedClient()
    const id = await defaultGroupId(api)

    assert.equal((await api.del(`/api/groups/${id}?moveTo=${id}`)).status, 400)
    assert.equal((await api.del(`/api/groups/${id}?moveTo=nope`)).status, 400)
    assert.equal((await api.del('/api/groups/nope')).status, 404)
  })
})

describe('PUT /api/groups/order', () => {
  it('按传入顺序重编号', async () => {
    const { api } = await authedClient()
    const first = await defaultGroupId(api)
    const second = await json<Group>(await api.post('/api/groups', { name: '第二个' }))
    const third = await json<Group>(await api.post('/api/groups', { name: '第三个' }))

    const response = await api.put('/api/groups/order', { ids: [third.id, second.id, first] })
    assert.equal(response.status, 204)

    const boot = await json<BootstrapResponse>(await api.get('/api/bootstrap'))
    assert.deepEqual(boot.groups.map((group) => group.name), ['第三个', '第二个', '常用'])
    assert.deepEqual(boot.groups.map((group) => group.sortOrder), [1024, 2048, 3072])
  })

  it('顺序不完整或含重复返回 400', async () => {
    const { api } = await authedClient()
    const first = await defaultGroupId(api)
    const second = await json<Group>(await api.post('/api/groups', { name: '第二个' }))

    assert.equal((await api.put('/api/groups/order', { ids: [first] })).status, 400, '缺少分组')
    assert.equal(
      (await api.put('/api/groups/order', { ids: [first, second.id, 'nope'] })).status,
      400,
      '含不存在的 id',
    )
    assert.equal(
      (await api.put('/api/groups/order', { ids: [first, first] })).status,
      400,
      '含重复 id',
    )
    assert.equal((await api.put('/api/groups/order', { ids: 'x' })).status, 400, '不是数组')
  })
})

describe('分组接口的鉴权', () => {
  it('未登录时全部返回 401', async () => {
    const { deps } = await authedClient()
    const anonymous = createApp(deps)

    for (const [method, path] of [
      ['GET', '/api/groups'],
      ['POST', '/api/groups'],
      ['PATCH', '/api/groups/x'],
      ['DELETE', '/api/groups/x'],
      ['PUT', '/api/groups/order'],
    ] as const) {
      const response = await anonymous.request(path, { method })
      assert.equal(response.status, 401, `${method} ${path}`)
    }
  })
})

describe('书签与分组的联动', () => {
  it('返回的 Bookmark.groupId 与分组 id 对得上', async () => {
    const { api } = await authedClient()
    const id = await defaultGroupId(api)
    const bookmark = await json<Bookmark>(
      await api.post('/api/bookmarks', { groupId: id, title: '示例', url: 'https://example.com' }),
    )

    const boot = await json<BootstrapResponse>(await api.get('/api/bootstrap'))
    assert.ok(boot.groups.some((group) => group.id === bookmark.groupId))
  })
})
