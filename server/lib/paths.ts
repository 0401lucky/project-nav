// data/ 目录布局的唯一出处：db、图标缓存、上传壁纸。
// 备份这一个目录即可完整恢复整站。

import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface DataPaths {
  root: string
  dbFile: string
  iconsDir: string
  wallpapersDir: string
}

export const DB_FILE = 'nav.sqlite'

export function dataPaths(dataDir: string): DataPaths {
  const root = resolve(dataDir)
  return {
    root,
    dbFile: join(root, DB_FILE),
    iconsDir: join(root, 'icons'),
    wallpapersDir: join(root, 'wallpapers'),
  }
}

export function ensureDataDirs(paths: DataPaths): void {
  mkdirSync(paths.iconsDir, { recursive: true })
  mkdirSync(paths.wallpapersDir, { recursive: true })
}
