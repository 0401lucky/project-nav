// 启动入口：读配置 → 准备数据目录 → 开库 → 起服务。
// 配置或环境有问题时立刻退出，不做半可用状态。

import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { createDb } from './db.ts'
import { loadConfig } from './env.ts'
import { readBuiltinManifest, syncBuiltinWallpapers } from './lib/builtin-wallpapers.ts'
import { dataPaths, ensureDataDirs } from './lib/paths.ts'

function main(): void {
  const config = loadConfig()

  const paths = dataPaths(config.dataDir)
  ensureDataDirs(paths)
  const db = createDb(paths.dbFile)

  const builtinCount = syncBuiltinWallpapers(db, readBuiltinManifest())

  const app = createApp({ db, config, paths })

  serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`书签站已启动：http://localhost:${info.port}`)
    console.log(`数据目录：${paths.root}`)
    console.log(`内置壁纸：${builtinCount} 张`)
  })
}

try {
  main()
} catch (error) {
  console.error(`[启动失败] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
