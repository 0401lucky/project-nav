import { Hono } from 'hono'
import { parseBookmarksHtml } from '../lib/bookmarks-html.ts'
import { readJson } from '../lib/http.ts'
import { scheduleIconBatch } from '../lib/icons.ts'
import { applyImport } from '../lib/importer.ts'
import { parseLegacyJson } from '../lib/legacy.ts'
import { ValidationError } from '../types.ts'
import type { AppDeps } from '../types.ts'

const MAX_HTML_BYTES = 10 * 1024 * 1024

export function importRoutes(deps: AppDeps): Hono {
  const app = new Hono()

  app.post('/html', async (c) => {
    let form: FormData
    try {
      form = await c.req.formData()
    } catch {
      throw new ValidationError('请求必须是 multipart/form-data，并带一个 file 字段')
    }

    const file = form.get('file')
    if (!(file instanceof File)) throw new ValidationError('请选择要导入的书签 HTML 文件')
    if (file.size > MAX_HTML_BYTES) throw new ValidationError('文件超过 10MB，无法导入')

    const { result, iconJobs } = applyImport(deps.db, parseBookmarksHtml(await file.text()))
    scheduleIconBatch(deps.db, deps.paths, iconJobs)
    return c.json(result)
  })

  app.post('/legacy', async (c) => {
    const body = await readJson<unknown>(c)
    if (body === null) throw new ValidationError('请求体必须是 JSON')

    const { result, iconJobs } = applyImport(deps.db, parseLegacyJson(body))
    scheduleIconBatch(deps.db, deps.paths, iconJobs)
    return c.json(result)
  })

  return app
}
