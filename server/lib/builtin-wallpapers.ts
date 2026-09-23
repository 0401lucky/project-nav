// 内置壁纸的清单读取与入库。
// manifest.json 由 scripts/build-wallpapers.ts 产出，放在 public/wallpapers 下，
// 构建后随 dist 一起发布。

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WallpaperOrientation } from '../../shared/types.ts'
import type { Db } from '../types.ts'
import { BUILTIN_WALLPAPER_DIRS } from './paths.ts'
import { execute } from './query.ts'
import { readSettings, writeSetting } from './settings-store.ts'

export interface WallpaperManifestEntry {
  id: string
  orientation: WallpaperOrientation
  /** 横竖配对的主题 id */
  pairId: string | null
  /** 实际产出的档位宽度，前端据此拼 srcset */
  widths: number[]
}

export interface WallpaperManifest {
  version: number
  wallpapers: WallpaperManifestEntry[]
}

const MANIFEST_FILE = 'manifest.json'

export function manifestPath(dir: string): string {
  return join(dir, MANIFEST_FILE)
}

export function readBuiltinManifest(
  dirs: readonly string[] = BUILTIN_WALLPAPER_DIRS,
): WallpaperManifest | null {
  for (const dir of dirs) {
    const file = manifestPath(dir)
    if (!existsSync(file)) continue
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as WallpaperManifest
      if (Array.isArray(parsed?.wallpapers)) return parsed
    } catch {
      // 清单损坏时当作没有内置壁纸，不让整站起不来
    }
  }
  return null
}

/**
 * 把清单同步进 wallpapers 表，返回内置壁纸数量。
 *
 * 每次启动都跑而不是只跑首次：以后增删内置壁纸能自动带上。
 * 幂等——created_at 只在插入时写，所以壁纸选择器里的顺序不会每次启动都变。
 */
export function syncBuiltinWallpapers(db: Db, manifest: WallpaperManifest | null): number {
  if (manifest === null) return 0

  const now = Date.now()
  const entries = manifest.wallpapers

  entries.forEach((entry, index) => {
    execute(
      db,
      `INSERT INTO wallpapers (id, builtin, orientation, pair_id, widths, created_at)
       VALUES (?, 1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         builtin = 1,
         orientation = excluded.orientation,
         pair_id = excluded.pair_id,
         widths = excluded.widths`,
      entry.id,
      entry.orientation,
      entry.pairId,
      JSON.stringify(entry.widths),
      // 加 index 让清单顺序稳定地映射成创建顺序
      now + index,
    )
  })

  const ids = entries.map((entry) => entry.id)
  if (ids.length === 0) {
    execute(db, 'DELETE FROM wallpapers WHERE builtin = 1')
  } else {
    const placeholders = ids.map(() => '?').join(', ')
    execute(
      db,
      `DELETE FROM wallpapers WHERE builtin = 1 AND id NOT IN (${placeholders})`,
      ...ids,
    )
  }

  // 还没选过壁纸时默认用第一张，避免首屏没有背景
  if (readSettings(db).wallpaper === '' && ids.length > 0) {
    writeSetting(db, 'wallpaper', ids[0] as string)
  }

  return ids.length
}
