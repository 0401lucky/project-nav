import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseLegacyJson } from '../lib/legacy.ts'
import { UNCATEGORIZED_GROUP, ValidationError } from '../types.ts'

/** 旧站 Project 的字段形状（含本次重构要丢弃的那些） */
const LEGACY_ITEMS = [
  {
    id: 'p1',
    name: 'GitHub',
    url: 'https://github.com/',
    description: '代码托管',
    category: '开发',
    icon: 'https://github.com/favicon.ico',
    accentColor: '#24292e',
    pinned: true,
    private: false,
    createdAt: 1700000000000,
    visits: 42,
  },
  {
    id: 'p2',
    name: 'Vue',
    url: 'https://vuejs.org/',
    category: '开发',
    visits: 7,
  },
  {
    id: 'p3',
    name: 'Fig',
    url: 'https://fig.io/',
    category: '工具',
  },
]

describe('parseLegacyJson', () => {
  it('接受旧站 /api/projects 的完整响应体 { items: [...] }', () => {
    const groups = parseLegacyJson({ items: LEGACY_ITEMS })
    assert.deepEqual(
      groups.map((group) => group.name),
      ['开发', '工具'],
    )
  })

  it('也接受只截取出来的裸数组', () => {
    const groups = parseLegacyJson(LEGACY_ITEMS)
    assert.deepEqual(
      groups.map((group) => group.name),
      ['开发', '工具'],
    )
  })

  it('name → 标题、category → 分组、description → 描述', () => {
    const groups = parseLegacyJson(LEGACY_ITEMS)
    assert.deepEqual(groups[0]!.bookmarks, [
      { title: 'GitHub', url: 'https://github.com', description: '代码托管' },
      { title: 'Vue', url: 'https://vuejs.org', description: undefined },
    ])
  })

  it('丢弃点击计数、公开私有一类本次重构砍掉的字段', () => {
    const groups = parseLegacyJson(LEGACY_ITEMS)
    const bookmark = groups[0]!.bookmarks[0]! as unknown as Record<string, unknown>
    for (const dropped of ['visits', 'private', 'pinned', 'accentColor', 'icon', 'id', 'createdAt']) {
      assert.equal(bookmark[dropped], undefined, `${dropped} 不该保留`)
    }
  })

  it('缺少 name 时用网址当标题', () => {
    const groups = parseLegacyJson([{ url: 'https://a.example.com/', category: '工具' }])
    assert.equal(groups[0]!.bookmarks[0]!.title, 'https://a.example.com')
  })

  it('缺少 category 时归入未分类', () => {
    const groups = parseLegacyJson([{ name: 'x', url: 'https://a.example.com/' }])
    assert.deepEqual(groups.map((group) => group.name), [UNCATEGORIZED_GROUP])
  })

  it('网址非法或不是字符串的条目被跳过', () => {
    const groups = parseLegacyJson([
      { name: '好', url: 'https://ok.example.com/', category: '工具' },
      { name: '坏', url: 'javascript:alert(1)', category: '工具' },
      { name: '缺', category: '工具' },
      { name: '数字', url: 123, category: '工具' },
      null,
    ])
    assert.deepEqual(groups[0]!.bookmarks.map((item) => item.title), ['好'])
  })

  it('无法识别的结构抛 ValidationError', () => {
    for (const input of [null, 'string', 42, {}, { items: 'not-array' }]) {
      assert.throws(() => parseLegacyJson(input), ValidationError, `input=${JSON.stringify(input)}`)
    }
  })

  it('空数组返回空结果', () => {
    assert.deepEqual(parseLegacyJson([]), [])
    assert.deepEqual(parseLegacyJson({ items: [] }), [])
  })
})
