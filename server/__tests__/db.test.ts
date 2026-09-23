import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { createDb, DEFAULT_GROUP_ICON, DEFAULT_GROUP_NAME, SORT_STEP } from '../db.ts'
import { readSettings } from '../lib/settings-store.ts'
import { queryAll } from '../lib/query.ts'
import type { GroupRow } from '../types.ts'

describe('数据库首次启动', () => {
  it('建出默认分组与默认设置', () => {
    const db = createDb(':memory:')

    const groups = queryAll<GroupRow>(db, 'SELECT * FROM groups')
    assert.equal(groups.length, 1)
    assert.equal(groups[0]!.name, DEFAULT_GROUP_NAME)
    assert.equal(groups[0]!.icon, DEFAULT_GROUP_ICON)
    assert.equal(groups[0]!.sort_order, SORT_STEP)

    const settings = readSettings(db)
    assert.equal(settings.wallpaper, '')
    assert.equal(settings.accent, '#e8c87a')
    assert.equal(settings.searchEngine.name, 'Google')
    assert.match(settings.searchEngine.template, /%s/)
    assert.match(settings.bookmarkletToken, /^[0-9a-f]{64}$/)
  })

  it('外键级联打开，删除分组会带走书签', () => {
    const db = createDb(':memory:')
    const groupId = queryAll<GroupRow>(db, 'SELECT * FROM groups')[0]!.id
    const now = Date.now()
    db.prepare(
      `INSERT INTO bookmarks (id, group_id, title, url, description, has_icon, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, 0, ?, ?, ?)`,
    ).run('bm1', groupId, '示例', 'https://example.com', SORT_STEP, now, now)

    db.prepare('DELETE FROM groups WHERE id = ?').run(groupId)

    assert.equal(queryAll(db, 'SELECT * FROM bookmarks').length, 0)
  })
})

describe('数据库重开', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nav-db-'))
  after(() => rmSync(dir, { recursive: true, force: true }))

  it('已有库不会被重新播种，设置与数据都保留', () => {
    const file = join(dir, 'nav.sqlite')

    const first = createDb(file)
    const token = readSettings(first).bookmarkletToken
    const groupId = queryAll<GroupRow>(first, 'SELECT * FROM groups')[0]!.id
    first.close()

    const second = createDb(file)
    assert.equal(readSettings(second).bookmarkletToken, token)
    assert.equal(queryAll<GroupRow>(second, 'SELECT * FROM groups').length, 1)
    assert.equal(queryAll<GroupRow>(second, 'SELECT * FROM groups')[0]!.id, groupId)
    second.close()
  })
})
