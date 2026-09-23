// Hono 应用组装。单独成文件（不写在 index.ts 里）是为了让测试能拿到 app
// 而不真正监听端口。

import { existsSync } from 'node:fs'
import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import type { MiddlewareHandler } from 'hono'
import { requireAuth } from './auth.ts'
import { addRoutes } from './routes/add.ts'
import { authRoutes } from './routes/auth.ts'
import { bookmarkRoutes } from './routes/bookmarks.ts'
import { bootstrapRoutes } from './routes/bootstrap.ts'
import { groupRoutes } from './routes/groups.ts'
import { importRoutes } from './routes/import.ts'
import { metaRoutes } from './routes/meta.ts'
import { settingsRoutes } from './routes/settings.ts'
import { ValidationError } from './types.ts'
import type { AppDeps } from './types.ts'

/** vite 构建产物目录，与 Dockerfile 的 WORKDIR 保持一致 */
const DIST_DIR = './dist'
/** 开发环境下 vite 直接从 public/ 提供内置壁纸 */
const PUBLIC_DIR = './public'

/** 哈希资源可长期缓存；index.html 不缓存 */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'
const NO_CACHE = 'no-cache'
/**
 * 图标文件名固定（按 id 推导），但前端会带 ?v=updatedAt 请求，
 * URL 随内容变化，所以可以放心长期不可变缓存。
 */
const ICON_CACHE = 'public, max-age=31536000, immutable'
const WALLPAPER_CACHE = 'public, max-age=604800'

export function createApp(deps: AppDeps): Hono {
  const app = new Hono()

  // 登录接口本身不能要求已登录
  app.route('/api/auth', authRoutes(deps))

  // bookmarklet 入口自带令牌校验，不走会话
  app.route('/add', addRoutes(deps))

  // 注册位置在 auth 路由之后：/api/auth/* 先被上面的 handler 消费掉
  app.use('/api/*', requireAuth(deps.config.sessionSecret))
  app.route('/api/bootstrap', bootstrapRoutes(deps))
  app.route('/api/groups', groupRoutes(deps))
  app.route('/api/bookmarks', bookmarkRoutes(deps))
  app.route('/api/settings', settingsRoutes(deps))
  app.route('/api/meta', metaRoutes())
  app.route('/api/import', importRoutes(deps))

  const iconHandler = staticAt(deps.paths.root, () => ICON_CACHE)
  if (iconHandler) app.get('/icons/*', iconHandler)

  // 壁纸查找顺序：上传的覆盖内置的
  for (const root of [deps.paths.root, DIST_DIR, PUBLIC_DIR]) {
    const handler = staticAt(root, () => WALLPAPER_CACHE)
    if (handler) app.get('/wallpapers/*', handler)
  }

  const distHandler = staticAt(DIST_DIR, (path) =>
    path.endsWith('.html') ? NO_CACHE : IMMUTABLE_CACHE,
  )
  if (distHandler) app.get('/*', distHandler)

  app.notFound((c) => c.json({ error: '没有这个地址' }, 404))

  // 入参校验失败统一转 400，路由里就不用每个都写 try/catch
  app.onError((error, c) => {
    if (error instanceof ValidationError) {
      return c.json({ error: error.message }, 400)
    }
    console.error('[请求出错]', error)
    return c.json({ error: '服务器内部错误' }, 500)
  })

  return app
}

/**
 * 目录不存在时不注册 handler：serveStatic 会在创建时打一条 console.error，
 * 而 dist/ 在前端构建前本来就不存在。代价是构建完需要重启服务。
 */
function staticAt(
  root: string,
  cacheControl: (path: string) => string,
): MiddlewareHandler | null {
  if (!existsSync(root)) return null
  return serveStatic({
    root,
    onFound: (path, c) => {
      c.header('Cache-Control', cacheControl(path))
    },
  })
}
