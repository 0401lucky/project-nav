import { Hono } from 'hono'
import { forbidden, noContent, notFound } from '../lib/http.ts'
import {
  ALLOWED_UPLOAD_MIME,
  deleteWallpaperFiles,
  MAX_UPLOAD_BYTES,
  writeWallpaperVariants,
} from '../lib/images.ts'
import { newId } from '../lib/id.ts'
import { createWallpaper, deleteWallpaperRow, findWallpaperRow } from '../lib/repo.ts'
import { parseWidths } from '../lib/serialize.ts'
import { readSettings, writeSetting } from '../lib/settings-store.ts'
import { ValidationError } from '../types.ts'
import type { AppDeps } from '../types.ts'

export function wallpaperRoutes(deps: AppDeps): Hono {
  const app = new Hono()

  app.post('/', async (c) => {
    let form: FormData
    try {
      form = await c.req.formData()
    } catch {
      throw new ValidationError('请求必须是 multipart/form-data，并带一个 file 字段')
    }

    const file = form.get('file')
    if (!(file instanceof File)) throw new ValidationError('请选择要上传的图片')
    if (file.size > MAX_UPLOAD_BYTES) throw new ValidationError('图片不能超过 10MB')
    if (!ALLOWED_UPLOAD_MIME.has(file.type)) {
      throw new ValidationError(`不支持的图片格式：${file.type || '未知'}，请用 JPEG / PNG / WebP / AVIF`)
    }

    const source = Buffer.from(await file.arrayBuffer())
    const id = newId()

    let encoded
    try {
      encoded = await writeWallpaperVariants(source, deps.paths.wallpapersDir, id)
    } catch {
      throw new ValidationError('这个文件无法解码成图片')
    }

    return c.json(
      createWallpaper(deps.db, {
        id,
        orientation: encoded.orientation,
        widths: encoded.widths,
      }),
      201,
    )
  })

  app.delete('/:id', async (c) => {
    const id = c.req.param('id')
    const row = findWallpaperRow(deps.db, id)
    if (row === undefined) return notFound(c, '壁纸不存在')
    if (row.builtin === 1) return forbidden(c, '内置壁纸不能删除')

    deleteWallpaperRow(deps.db, id)
    await deleteWallpaperFiles(deps.paths.wallpapersDir, id, parseWidths(row.widths))

    // 删掉的正好是当前在用的一张时清空选择，前端会回落到第一张
    if (readSettings(deps.db).wallpaper === id) {
      writeSetting(deps.db, 'wallpaper', '')
    }

    return noContent(c)
  })

  return app
}
