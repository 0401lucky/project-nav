// 打开 SQLite、建表、写入首次启动的默认数据。
// Node 24+ 内置 node:sqlite，免原生编译，Docker 镜像里不需要编译工具链。

import { randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { newId } from './lib/id.ts'
import { count, execute } from './lib/query.ts'
import { ensureSettingDefaults } from './lib/settings-store.ts'
import type { Db } from './types.ts'

/** 排序间隔：插入取中值，用尽时整组重编号 */
export const SORT_STEP = 1024
export const DEFAULT_GROUP_NAME = '常用'
export const DEFAULT_GROUP_ICON = '⭐'

/** 32 字节 hex，bookmarklet 用它校验来源 */
export function newBookmarkletToken(): string {
  return randomBytes(32).toString('hex')
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS groups (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT,
  sort_order  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  url         TEXT NOT NULL,
  description TEXT,
  has_icon    INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_group ON bookmarks(group_id, sort_order);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wallpapers (
  id          TEXT PRIMARY KEY,
  builtin     INTEGER NOT NULL DEFAULT 0,
  orientation TEXT NOT NULL,
  pair_id     TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip           TEXT PRIMARY KEY,
  fails        INTEGER NOT NULL,
  locked_until INTEGER
);
`

/** @param file SQLite 文件路径，测试传 ':memory:' */
export function createDb(file: string): Db {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA)
  seedDefaults(db)
  return db
}

function seedDefaults(db: Db): void {
  ensureSettingDefaults(db, newBookmarkletToken())

  if (count(db, 'SELECT COUNT(*) AS n FROM groups') === 0) {
    execute(
      db,
      'INSERT INTO groups (id, name, icon, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
      newId(),
      DEFAULT_GROUP_NAME,
      DEFAULT_GROUP_ICON,
      SORT_STEP,
      Date.now(),
    )
  }
}
