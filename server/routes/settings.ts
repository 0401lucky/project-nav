import { Hono } from 'hono'
import { readJson } from '../lib/http.ts'
import { patchSettings, readSettings } from '../lib/settings-store.ts'
import type { Settings } from '../../shared/types.ts'
import type { AppDeps } from '../types.ts'

export function settingsRoutes(deps: AppDeps): Hono {
  const app = new Hono()

  app.get('/', (c) => c.json(readSettings(deps.db)))

  // 白名单与校验在 settings-store 里，非法值抛 ValidationError → app.onError 转 400
  app.patch('/', async (c) => {
    const body = await readJson<Partial<Settings>>(c)
    return c.json(patchSettings(deps.db, body ?? {}))
  })

  return app
}
