import { Hono } from 'hono'
import {
  noContent,
  notFound,
  optionalText,
  readJson,
  requireIdList,
  requireText,
  requireUrl,
} from '../lib/http.ts'
import {
  createBookmark,
  deleteBookmark,
  findGroupRow,
  listBookmarkRows,
  reorderBookmarks,
  updateBookmark,
} from '../lib/repo.ts'
import { ValidationError } from '../types.ts'
import type { AppDeps } from '../types.ts'

const TITLE_MAX = 200
const DESCRIPTION_MAX = 1000
const ID_MAX = 64

interface BookmarkBody {
  groupId?: unknown
  title?: unknown
  url?: unknown
  description?: unknown
}

export function bookmarkRoutes(deps: AppDeps): Hono {
  const app = new Hono()

  app.put('/order', async (c) => {
    const body = await readJson<{ groupId?: unknown; ids?: unknown }>(c)
    const groupId = requireText(body?.groupId, '分组', ID_MAX)
    const ids = requireIdList(body?.ids, 'ids')

    if (findGroupRow(deps.db, groupId) === undefined) return notFound(c, '分组不存在')

    const rows = listBookmarkRows(deps.db)
    const known = new Set(rows.map((row) => row.id))
    const unknownId = ids.find((id) => !known.has(id))
    if (unknownId !== undefined) return notFound(c, `书签 ${unknownId} 不存在`)

    // 该分组现有的书签必须全部在 ids 里：漏掉的话它们会保留旧序号，
    // 与重编号后的位置互相穿插，顺序就不可预期了
    const missing = rows
      .filter((row) => row.group_id === groupId)
      .map((row) => row.id)
      .filter((id) => !ids.includes(id))
    if (missing.length > 0) {
      throw new ValidationError('ids 必须包含该分组现有的全部书签')
    }

    reorderBookmarks(deps.db, groupId, ids)
    return noContent(c)
  })

  app.post('/', async (c) => {
    const body = await readJson<BookmarkBody>(c)
    const groupId = requireText(body?.groupId, '分组', ID_MAX)
    if (findGroupRow(deps.db, groupId) === undefined) {
      throw new ValidationError('目标分组不存在')
    }

    const title = requireText(body?.title, '标题', TITLE_MAX)
    const url = requireUrl(body?.url, '网址')
    const description = optionalText(body?.description, '描述', DESCRIPTION_MAX) ?? null

    return c.json(createBookmark(deps.db, { groupId, title, url, description }), 201)
  })

  app.patch('/:id', async (c) => {
    const body = await readJson<BookmarkBody>(c)
    const patch: {
      title?: string
      url?: string
      description?: string | null
      groupId?: string
    } = {}

    if (body?.title !== undefined) patch.title = requireText(body.title, '标题', TITLE_MAX)
    if (body?.url !== undefined) patch.url = requireUrl(body.url, '网址')
    if (body?.description !== undefined) {
      patch.description = optionalText(body.description, '描述', DESCRIPTION_MAX) ?? null
    }
    if (body?.groupId !== undefined) {
      const groupId = requireText(body.groupId, '分组', ID_MAX)
      if (findGroupRow(deps.db, groupId) === undefined) {
        throw new ValidationError('目标分组不存在')
      }
      patch.groupId = groupId
    }

    const bookmark = updateBookmark(deps.db, c.req.param('id'), patch)
    if (bookmark === undefined) return notFound(c, '书签不存在')
    return c.json(bookmark)
  })

  app.delete('/:id', (c) => {
    if (!deleteBookmark(deps.db, c.req.param('id'))) return notFound(c, '书签不存在')
    return noContent(c)
  })

  return app
}
