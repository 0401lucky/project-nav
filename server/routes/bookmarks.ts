import { Hono } from 'hono'
import type { IconRefreshResponse } from '../../shared/types.ts'
import {
  noContent,
  notFound,
  optionalText,
  optionalUrl,
  readJson,
  requireIdList,
  requireText,
  requireUrl,
} from '../lib/http.ts'
import {
  cacheIcon,
  cacheIconFromBuffer,
  cacheIconFromPage,
  deleteIcons,
  MAX_ICON_BYTES,
  publicIconSource,
  refetchMissingIcons,
  scheduleIconCache,
} from '../lib/icons.ts'
import type { IconResult } from '../lib/icons.ts'
import {
  createBookmark,
  deleteBookmark,
  findBookmarkRow,
  findGroupRow,
  listBookmarkRows,
  reorderBookmarks,
  setBookmarkHasIcon,
  updateBookmark,
} from '../lib/repo.ts'
import { toBookmark } from '../lib/serialize.ts'
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
  iconUrl?: unknown
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

  // 同步执行：用户在设置里点了按钮就等结果，27 条左右实测一分钟内
  app.post('/icons/refetch-missing', async (c) => {
    return c.json(await refetchMissingIcons(deps.db, deps.paths))
  })

  app.get('/:id', (c) => {
    const row = findBookmarkRow(deps.db, c.req.param('id'))
    return row === undefined ? notFound(c, '书签不存在') : c.json(toBookmark(row))
  })

  /** 图标操作的统一收尾：失败不动旧图标，只把原因带回去 */
  function iconResponse(id: string, result: IconResult, failure?: (reason: string) => string): IconRefreshResponse | null {
    const row = findBookmarkRow(deps.db, id)
    if (row === undefined) return null
    const bookmark = toBookmark(row)
    if (result.ok) return { bookmark }
    return { bookmark, error: failure === undefined ? result.reason : failure(result.reason) }
  }

  app.post('/:id/icon/refetch', async (c) => {
    const id = c.req.param('id')
    const row = findBookmarkRow(deps.db, id)
    if (row === undefined) return notFound(c, '书签不存在')
    const payload = iconResponse(id, await cacheIconFromPage(deps.db, deps.paths, id, row.url))
    return payload === null ? notFound(c, '书签不存在') : c.json(payload)
  })

  // 唯一会访问第三方图标服务的地方，只由用户点击触发
  app.post('/:id/icon/public', async (c) => {
    const id = c.req.param('id')
    const row = findBookmarkRow(deps.db, id)
    if (row === undefined) return notFound(c, '书签不存在')
    const source = publicIconSource(row.url)
    if (source === null) throw new ValidationError('这个网址没有可识别的域名')
    const result = await cacheIcon(deps.db, deps.paths, id, source)
    const payload = iconResponse(id, result, (reason) =>
      reason.includes('404') ? '公共服务也没有这个站的图标' : `公共服务获取失败：${reason}`,
    )
    return payload === null ? notFound(c, '书签不存在') : c.json(payload)
  })

  app.put('/:id/icon', async (c) => {
    const id = c.req.param('id')
    if (findBookmarkRow(deps.db, id) === undefined) return notFound(c, '书签不存在')

    let form: FormData
    try {
      form = await c.req.formData()
    } catch {
      throw new ValidationError('请求必须是 multipart/form-data，并带一个 file 字段')
    }
    const file = form.get('file')
    if (!(file instanceof File)) throw new ValidationError('请选择要上传的图片')
    if (file.size > MAX_ICON_BYTES) throw new ValidationError('图片不能超过 1MB')

    const raw = Buffer.from(await file.arrayBuffer())
    const payload = iconResponse(id, await cacheIconFromBuffer(deps.db, deps.paths, id, raw))
    return payload === null ? notFound(c, '书签不存在') : c.json(payload)
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
    // 所有校验都必须在写库之前：校验失败返回 400 时不能留下半条数据
    const iconUrl = optionalUrl(body?.iconUrl, '图标地址')

    const created = createBookmark(deps.db, { groupId, title, url, description })

    // 先回响应，再去下载图标：外部站点的响应速度不该拖住保存
    if (typeof iconUrl === 'string') {
      scheduleIconCache(deps.db, deps.paths, created.id, created.url, iconUrl)
    }

    return c.json(created, 201)
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

    // 校验全部前置到写库之前，400 时不能留下已生效的改动
    const iconUrl = optionalUrl(body?.iconUrl, '图标地址')

    const id = c.req.param('id')
    const bookmark = updateBookmark(deps.db, id, patch)
    if (bookmark === undefined) return notFound(c, '书签不存在')

    // 换了图标先降回 has_icon=0，前端立刻显示首字色块；抓成功再翻回 1
    if (iconUrl === null) {
      setBookmarkHasIcon(deps.db, id, false)
      await deleteIcons(deps.paths, [id])
      return c.json({ ...bookmark, hasIcon: false })
    }
    if (typeof iconUrl === 'string') {
      setBookmarkHasIcon(deps.db, id, false)
      scheduleIconCache(deps.db, deps.paths, id, bookmark.url, iconUrl)
      return c.json({ ...bookmark, hasIcon: false })
    }

    return c.json(bookmark)
  })

  app.delete('/:id', async (c) => {
    const id = c.req.param('id')
    if (!deleteBookmark(deps.db, id)) return notFound(c, '书签不存在')

    await deleteIcons(deps.paths, [id])
    return noContent(c)
  })

  return app
}
