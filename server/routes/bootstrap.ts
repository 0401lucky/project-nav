import { Hono } from 'hono'
import { readBootstrap } from '../lib/repo.ts'
import type { AppDeps } from '../types.ts'

export function bootstrapRoutes(deps: AppDeps): Hono {
  const app = new Hono()

  app.get('/', (c) => c.json(readBootstrap(deps.db)))

  return app
}
