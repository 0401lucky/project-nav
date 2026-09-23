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

/** vite 构建产物目录，路径常量与 Dockerfile 的 WORKDIR 保持一致 */
export const DIST_DIR = './dist'
/** 开发环境下 vite 直接从 public/ 提供内置壁纸 */
export const PUBLIC_DIR = './public'

/** 内置壁纸目录：构建产物优先（生产），其次 public（开发） */
export const BUILTIN_WALLPAPER_DIRS = [join(DIST_DIR, 'wallpapers'), join(PUBLIC_DIR, 'wallpapers')]

/** 构建脚本写出内置壁纸的位置 */
export const PUBLIC_WALLPAPER_DIR = join(PUBLIC_DIR, 'wallpapers')

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
