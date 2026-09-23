// 导入测试用的网址一律指向 127.0.0.1:1（必然立刻连接被拒）。
// 导入会在响应之后异步抓 favicon，用真实域名会让测试跑出站网络、慢且不稳。

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { BootstrapResponse, Group, ImportResult } from '../../shared/types.ts'
import { authedClient, createApp, json } from './helpers.ts'
import type { ApiClient } from './helpers.ts'

const HTML_EXPORT = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<DL><p>
    <DT><H3>书签栏</H3>
    <DL><p>
        <DT><A HREF="http://127.0.0.1:1/alpha">Alpha</A>
        <DT><A HREF="http://127.0.0.1:1/beta">Beta</A>
    </DL><p>
    <DT><H3>其他书签</H3>
    <DL><p>
        <DT><A HREF="http://127.0.0.1:1/gamma">Gamma</A>
    </DL><p>
</DL><p>`

const LEGACY_ITEMS = [
  { name: 'Alpha', url: 'http://127.0.0.1:1/alpha', category: '开发' },
  { name: 'Delta', url: 'http://127.0.0.1:1/delta', category: '工具' },
]

function htmlForm(content: string, filename = 'bookmarks.html'): FormData {
  const form = new FormData()
  form.set('file', new File([content], filename, { type: 'text/html' }))
  return form
}

async function snapshot(api: ApiClient): Promise<BootstrapResponse> {
  return json<BootstrapResponse>(await api.get('/api/bootstrap'))
}

/**
 * sort_order 是按分组独立编号的（每组都从 1024 起），所以全局列表里
 * 不同分组的书签本来就会交错。顺序只在分组内部有意义。
 */
function titlesInGroup(boot: BootstrapResponse, name: string): string[] {
  const group = boot.groups.find((item) => item.name === name)
  if (group === undefined) return []
  return boot.bookmarks.filter((item) => item.groupId === group.id).map((item) => item.title)
}

describe('POST /api/import/html', () => {
  it('文件夹变分组、书签进对应分组，并返回导入数量', async () => {
    const { api } = await authedClient()

    const result = await json<ImportResult>(await api.post('/api/import/html', htmlForm(HTML_EXPORT)))
    assert.deepEqual(result, { groups: 2, bookmarks: 3 })

    const boot = await snapshot(api)
    assert.deepEqual(
      boot.groups.map((group) => group.name),
      ['常用', '书签栏', '其他书签'],
    )
    assert.deepEqual(titlesInGroup(boot, '书签栏'), ['Alpha', 'Beta'])
    assert.deepEqual(titlesInGroup(boot, '其他书签'), ['Gamma'])
  })

  it('重复导入同样的文件不会产生重复书签', async () => {
    const { api } = await authedClient()
    await api.post('/api/import/html', htmlForm(HTML_EXPORT))

    const second = await json<ImportResult>(await api.post('/api/import/html', htmlForm(HTML_EXPORT)))
    assert.deepEqual(second, { groups: 0, bookmarks: 0 })

    const boot = await snapshot(api)
    assert.equal(boot.bookmarks.length, 3, '总数不该增加')
    assert.equal(boot.groups.length, 3, '分组也不该重复创建')
  })

  it('已有同名分组时复用，不新建', async () => {
    const { api } = await authedClient()
    const existing = await json<Group>(await api.post('/api/groups', { name: '书签栏' }))

    const result = await json<ImportResult>(await api.post('/api/import/html', htmlForm(HTML_EXPORT)))
    assert.equal(result.groups, 1, '只应新建「其他书签」')

    const boot = await snapshot(api)
    assert.equal(boot.groups.filter((group) => group.name === '书签栏').length, 1)
    assert.ok(
      boot.bookmarks.filter((item) => item.groupId === existing.id).length === 2,
      '书签应落进已有分组',
    )
  })

  it('导入过程中遇到已存在的网址会跳过', async () => {
    const { api } = await authedClient()
    const boot = await snapshot(api)
    await api.post('/api/bookmarks', {
      groupId: boot.groups[0]!.id,
      title: '先来的 Alpha',
      url: 'http://127.0.0.1:1/alpha',
    })

    const result = await json<ImportResult>(await api.post('/api/import/html', htmlForm(HTML_EXPORT)))
    assert.deepEqual(result, { groups: 2, bookmarks: 2 })
  })

  it('缺少 file 字段返回 400', async () => {
    const { api } = await authedClient()
    const empty = new FormData()
    empty.set('note', '没有文件')
    assert.equal((await api.post('/api/import/html', empty)).status, 400)
  })

  it('不是 multipart 请求返回 400', async () => {
    const { api } = await authedClient()
    assert.equal((await api.post('/api/import/html', { file: 'x' })).status, 400)
  })
})

describe('POST /api/import/legacy', () => {
  it('category 变分组、name 变标题', async () => {
    const { api } = await authedClient()

    const result = await json<ImportResult>(await api.post('/api/import/legacy', LEGACY_ITEMS))
    assert.deepEqual(result, { groups: 2, bookmarks: 2 })

    const boot = await snapshot(api)
    assert.deepEqual(
      boot.groups.map((group) => group.name),
      ['常用', '开发', '工具'],
    )
    assert.equal(boot.bookmarks.find((item) => item.title === 'Alpha')!.url, 'http://127.0.0.1:1/alpha')
  })

  it('也接受旧站接口原始的 { items: [...] } 形状', async () => {
    const { api } = await authedClient()
    const result = await json<ImportResult>(
      await api.post('/api/import/legacy', { items: LEGACY_ITEMS }),
    )
    assert.equal(result.bookmarks, 2)
  })

  it('结构无法识别返回 400', async () => {
    const { api } = await authedClient()
    for (const body of ['字符串', 42, {}, { items: 'x' }]) {
      assert.equal((await api.post('/api/import/legacy', body)).status, 400, JSON.stringify(body))
    }
  })

  it('与 HTML 导入共用去重：两处都有的网址只留一条', async () => {
    const { api } = await authedClient()
    await api.post('/api/import/legacy', LEGACY_ITEMS)

    const result = await json<ImportResult>(await api.post('/api/import/html', htmlForm(HTML_EXPORT)))
    assert.equal(result.bookmarks, 2, 'Alpha 已在库里，只剩 Beta 与 Gamma')

    const boot = await snapshot(api)
    assert.equal(boot.bookmarks.filter((item) => item.url.endsWith('/alpha')).length, 1)
  })
})

describe('导入接口的鉴权', () => {
  it('未登录返回 401', async () => {
    const { deps } = await authedClient()
    const anonymous = createApp(deps)

    assert.equal((await anonymous.request('/api/import/html', { method: 'POST' })).status, 401)
    assert.equal((await anonymous.request('/api/import/legacy', { method: 'POST' })).status, 401)
  })
})

describe('导入时的分组名长度', () => {
  it('文件夹名过长按上限截断，截断后仍能正常编辑', async () => {
    const { api } = await authedClient()
    const longName = '长'.repeat(200)

    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><H3>${longName}</H3>
    <DL><p>
        <DT><A HREF="http://127.0.0.1:1/long">超长文件夹里的书签</A>
    </DL><p>
</DL><p>`

    const result = await json<ImportResult>(await api.post('/api/import/html', htmlForm(html)))
    assert.equal(result.bookmarks, 1)

    const boot = await snapshot(api)
    const created = boot.groups.find((group) => group.name !== '常用')
    assert.ok(created, '应该建出了分组')
    assert.equal(
      created.name.length,
      40,
      '导入的组名必须和路由共用同一个上限，否则它会绕过校验',
    )

    // 截断的意义就在这里：不截断的话用户在这个分组上连保存都做不到
    const patched = await api.patch(`/api/groups/${created.id}`, { name: created.name })
    assert.equal(patched.status, 200)
  })
})
