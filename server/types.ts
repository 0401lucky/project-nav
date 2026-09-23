// 服务端内部类型：SQLite 行形状（snake_case）与应用依赖。
// 对外 API 形状在 shared/types.ts，两处靠 lib/serialize.ts 转换。

import type { DatabaseSync } from 'node:sqlite'
import type { ServerConfig } from './env.ts'
import type { DataPaths } from './lib/paths.ts'
import type { WallpaperOrientation } from '../shared/types.ts'

export type Db = DatabaseSync

export interface GroupRow {
  id: string
  name: string
  icon: string | null
  sort_order: number
  created_at: number
}

export interface BookmarkRow {
  id: string
  group_id: string
  title: string
  url: string
  description: string | null
  has_icon: number
  sort_order: number
  created_at: number
  updated_at: number
}

export interface WallpaperRow {
  id: string
  builtin: number
  orientation: WallpaperOrientation
  pair_id: string | null
  /** 档位宽度的 JSON 数组字符串 */
  widths: string
  created_at: number
}

/** 路由工厂需要的一切，由 index.ts 组装后注入，测试里换成内存库 */
export interface AppDeps {
  db: Db
  config: ServerConfig
  paths: DataPaths
}

/** 导入解析器的统一产物：两个解析器（书签 HTML / 旧站 JSON）都归到这里 */
export interface ImportedBookmark {
  title: string
  url: string
  description?: string | null
}

export interface ImportedGroup {
  name: string
  bookmarks: ImportedBookmark[]
}

/** 没落在任何分组里的书签归到这里 */
export const UNCATEGORIZED_GROUP = '未分类'

/** 入参校验失败：路由统一映射成 400 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}
