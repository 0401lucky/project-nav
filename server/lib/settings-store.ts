// settings 表的读写与默认值。
// 白名单与校验集中在这里，路由只负责把 ValidationError 映射成 400。

import type { SearchEngine, Settings } from '../../shared/types.ts'
import type { Db } from '../types.ts'
import { ValidationError } from '../types.ts'
import { execute, queryOne } from './query.ts'

export const SETTING_KEYS = [
  'wallpaper',
  'searchEngine',
  'accent',
  'bookmarkletToken',
] as const
export type SettingKey = (typeof SETTING_KEYS)[number]

export const DEFAULT_SEARCH_ENGINE: SearchEngine = {
  name: 'Google',
  template: 'https://www.google.com/search?q=%s',
}
export const DEFAULT_ACCENT = '#e8c87a'
/** 默认壁纸留空：内置壁纸 id 在首次启动扫描 manifest 时才确定，前端在此之前用列表第一张兜底 */
export const DEFAULT_WALLPAPER = ''

/** 壁纸 id 会拼进 /wallpapers/{id}-*.avif 的 URL，因此限制字符集 */
const WALLPAPER_ID_PATTERN = /^$|^[A-Za-z0-9_-]{1,64}$/
const ACCENT_PATTERN = /^#[0-9a-fA-F]{6}$/
const SEARCH_TEMPLATE_PLACEHOLDER = '%s'

function readRaw(db: Db, key: SettingKey): string | null {
  const row = queryOne<{ value: string }>(
    db,
    'SELECT value FROM settings WHERE key = ?',
    key,
  )
  return row?.value ?? null
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    // 数据被手改坏时退回默认值，不让整个 bootstrap 挂掉
    return fallback
  }
}

export function writeSetting(db: Db, key: SettingKey, value: unknown): void {
  execute(
    db,
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    JSON.stringify(value),
  )
}

/** 只在 key 不存在时写入，不覆盖已有值 */
function writeSettingIfAbsent(db: Db, key: SettingKey, value: unknown): void {
  execute(db, 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', key, JSON.stringify(value))
}

export function ensureSettingDefaults(db: Db, bookmarkletToken: string): void {
  writeSettingIfAbsent(db, 'wallpaper', DEFAULT_WALLPAPER)
  writeSettingIfAbsent(db, 'searchEngine', DEFAULT_SEARCH_ENGINE)
  writeSettingIfAbsent(db, 'accent', DEFAULT_ACCENT)
  writeSettingIfAbsent(db, 'bookmarkletToken', bookmarkletToken)
}

export function readSettings(db: Db): Settings {
  const searchEngine = parseJson<Partial<SearchEngine> | null>(
    readRaw(db, 'searchEngine'),
    null,
  )
  return {
    wallpaper: parseJson<string>(readRaw(db, 'wallpaper'), DEFAULT_WALLPAPER),
    searchEngine: {
      name:
        typeof searchEngine?.name === 'string' && searchEngine.name.trim() !== ''
          ? searchEngine.name
          : DEFAULT_SEARCH_ENGINE.name,
      template:
        typeof searchEngine?.template === 'string' &&
        searchEngine.template.includes(SEARCH_TEMPLATE_PLACEHOLDER)
          ? searchEngine.template
          : DEFAULT_SEARCH_ENGINE.template,
    },
    accent: parseJson<string>(readRaw(db, 'accent'), DEFAULT_ACCENT),
    bookmarkletToken: parseJson<string>(readRaw(db, 'bookmarkletToken'), ''),
  }
}

/**
 * 局部更新。只有 wallpaper / searchEngine / accent 可写，
 * bookmarkletToken 只读（改动它会让已生成的 bookmarklet 立即失效）。
 */
export function patchSettings(db: Db, patch: Partial<Settings>): Settings {
  if (patch.wallpaper !== undefined) {
    if (typeof patch.wallpaper !== 'string' || !WALLPAPER_ID_PATTERN.test(patch.wallpaper)) {
      throw new ValidationError('壁纸 id 非法')
    }
    writeSetting(db, 'wallpaper', patch.wallpaper)
  }

  if (patch.searchEngine !== undefined) {
    const engine = patch.searchEngine
    if (typeof engine?.template !== 'string' || !engine.template.includes(SEARCH_TEMPLATE_PLACEHOLDER)) {
      throw new ValidationError(`搜索引擎模板必须包含占位符 ${SEARCH_TEMPLATE_PLACEHOLDER}`)
    }
    if (typeof engine.name !== 'string' || engine.name.trim() === '') {
      throw new ValidationError('搜索引擎需要名称')
    }
    writeSetting(db, 'searchEngine', { name: engine.name, template: engine.template })
  }

  if (patch.accent !== undefined) {
    if (typeof patch.accent !== 'string' || !ACCENT_PATTERN.test(patch.accent)) {
      throw new ValidationError('强调色必须是 #RRGGBB 格式')
    }
    writeSetting(db, 'accent', patch.accent)
  }

  return readSettings(db)
}
