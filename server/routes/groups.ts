import { Hono } from 'hono'
import {
  badRequest,
  GROUP_NAME_MAX,
  noContent,
  notFound,
  optionalText,
  readJson,
  requireIdList,
  requireText,
} from '../lib/http.ts'
import { deleteIcons } from '../lib/icons.ts'
import {
  createGroup,
  deleteGroup,
  findGroupRow,
  listBookmarkRows,
  listGroupRows,
  reorderGroups,
  updateGroup,
} from '../lib/repo.ts'
import { ValidationError } from '../types.ts'
import type { AppDeps } from '../types.ts'

/** emoji 含 ZWJ 组合可能占多个码元，留足余量 */
const ICON_MAX = 16

interface GroupBody {
  name?: unknown
  icon?: unknown
}

export function groupRoutes(deps: AppDeps): Hono {
  const app = new Hono()

  // 静态段必须注册在 /:id 之前，否则 "order" 会被当成 id
  app.put('/order', async (c) => {
    const body = await readJson<{ ids?: unknown }>(c)
    const ids = requireIdList(body?.ids, 'ids')

    // 必须是全量顺序：只传一部分会让没传到的分组保持旧序号，顺序变得不可预期
    const existing = listGroupRows(deps.db).map((row) => row.id)
    if (ids.length !== existing.length || !existing.every((id) => ids.includes(id))) {
      throw new ValidationError('ids 必须恰好包含全部分组的 id')
    }

    reorderGroups(deps.db, ids)
    return noContent(c)
  })

  app.post('/', async (c) => {
    const body = await readJson<GroupBody>(c)
    const name = requireText(body?.name, '分组名', GROUP_NAME_MAX)
    const icon = optionalText(body?.icon, '图标', ICON_MAX)

    return c.json(createGroup(deps.db, { name, icon: icon ?? null }), 201)
  })

  app.patch('/:id', async (c) => {
    const body = await readJson<GroupBody>(c)
    const patch: { name?: string; icon?: string | null } = {}
    if (body?.name !== undefined) patch.name = requireText(body.name, '分组名', GROUP_NAME_MAX)
    if (body?.icon !== undefined) patch.icon = optionalText(body.icon, '图标', ICON_MAX) ?? null

    const group = updateGroup(deps.db, c.req.param('id'), patch)
    if (group === undefined) return notFound(c, '分组不存在')
    return c.json(group)
  })

  app.delete('/:id', async (c) => {
    const id = c.req.param('id')
    if (findGroupRow(deps.db, id) === undefined) return notFound(c, '分组不存在')

    const moveTo = c.req.query('moveTo')
    if (moveTo !== undefined) {
      if (moveTo === id) return badRequest(c, '不能把书签移到正在删除的分组')
      if (findGroupRow(deps.db, moveTo) === undefined) return badRequest(c, '目标分组不存在')
    }

    // 不带 moveTo 时组内书签会被外键级联删掉，磁盘上的图标文件也要跟着清掉
    const orphanedIds =
      moveTo === undefined
        ? listBookmarkRows(deps.db)
            .filter((row) => row.group_id === id)
            .map((row) => row.id)
        : []

    deleteGroup(deps.db, id, moveTo ?? null)
    await deleteIcons(deps.paths, orphanedIds)
    return noContent(c)
  })

  return app
}
