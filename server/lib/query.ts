// SQLite 查询的唯一入口。
// node:sqlite 的 all()/get() 只声明返回 Record<string, SQLOutputValue>，
// 行形状的断言集中在这里，业务代码不直接碰 db.prepare()。

import type { SQLInputValue } from 'node:sqlite'
import type { Db } from '../types.ts'

export function queryAll<T>(db: Db, sql: string, ...params: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[]
}

export function queryOne<T>(
  db: Db,
  sql: string,
  ...params: SQLInputValue[]
): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined
}

export function execute(db: Db, sql: string, ...params: SQLInputValue[]): void {
  db.prepare(sql).run(...params)
}

export function count(db: Db, sql: string, ...params: SQLInputValue[]): number {
  const row = queryOne<{ n: number }>(db, sql, ...params)
  return row?.n ?? 0
}
