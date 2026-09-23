// bookmarklet 入口：浏览器书签栏点一下就跳到本站并预填当前页。
// 用长随机令牌而不是会话，因为点击发生在任意第三方页面上，带上 Cookie 不合语义。

import { Hono } from 'hono'
import { constantTimeEquals } from '../auth.ts'
import { readSettings } from '../lib/settings-store.ts'
import type { AppDeps } from '../types.ts'

/** 前端启动时识别这个 hash 来打开新增面板 */
export const ADD_HASH = '#add'

export function addRoutes(deps: AppDeps): Hono {
  const app = new Hono()

  app.get('/', (c) => {
    const expected = readSettings(deps.db).bookmarkletToken
    const token = c.req.query('token') ?? ''
    // expected 为空说明设置被改坏了：这时不能把空 token 当成「匹配」放行
    if (expected === '' || !constantTimeEquals(token, expected)) {
      return c.text('令牌无效，请回设置页重新拖一次收藏按钮', 403)
    }

    const params = new URLSearchParams()
    const url = c.req.query('url')
    const title = c.req.query('title')
    if (url !== undefined && url !== '') params.set('url', url)
    if (title !== undefined && title !== '') params.set('title', title)

    return c.redirect(`/${ADD_HASH}?${params.toString()}`, 302)
  })

  return app
}
