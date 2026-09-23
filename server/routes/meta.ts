import { Hono } from 'hono'
import type { MetaResponse } from '../../shared/types.ts'
import { readJson, requireUrl } from '../lib/http.ts'
import { fetchPage, normalizeUrl } from '../lib/scraper.ts'

export function metaRoutes(): Hono {
  const app = new Hono()

  app.post('/', async (c) => {
    const body = await readJson<{ url?: unknown }>(c)
    const url = requireUrl(body?.url, '网址')

    const page = await fetchPage(url)

    // 抓不到不算错误：返回 200 + 空字段 + error 说明，前端提示「可手动填写」
    if (!page.ok) {
      const failed: MetaResponse = {
        finalUrl: page.finalUrl,
        iconCandidates: [],
        error: page.errorMessage ?? '抓取失败',
      }
      return c.json(failed)
    }

    const payload: MetaResponse = {
      // 重定向后的地址也要规范化：前端会把它填回输入框，
      // 如果带结尾斜杠，用户看到的和最后存下来的就不是同一个写法
      finalUrl: normalizeUrl(page.finalUrl) ?? page.finalUrl,
      title: page.ogTitle ?? page.title,
      description: page.ogDescription ?? page.description,
      iconCandidates: page.logoCandidates ?? [],
    }
    return c.json(payload)
  })

  return app
}
