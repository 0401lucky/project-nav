// 请求层工具：请求体解析、入参校验、统一错误响应。
// 入参只在这一层校验，进到 repo 的数据都已经是可信形状
// （见 cross-layer-thinking-guide：校验只放在入口一次）。

import type { Context } from 'hono'
import { ValidationError } from '../types.ts'
import { normalizeUrl } from './scraper.ts'

/** 解析 JSON 请求体，格式非法或为空时返回 null，由调用方决定如何报错 */
export async function readJson<T>(c: Context): Promise<T | null> {
  try {
    return (await c.req.json()) as T
  } catch {
    return null
  }
}

export function badRequest(c: Context, error: string, detail?: string): Response {
  return c.json(detail === undefined ? { error } : { error, detail }, 400)
}

export function notFound(c: Context, error = '资源不存在'): Response {
  return c.json({ error }, 404)
}

export function forbidden(c: Context, error: string): Response {
  return c.json({ error }, 403)
}

export function noContent(c: Context): Response {
  return c.body(null, 204)
}

/** 必填文本：去首尾空白后不能为空，超过上限直接拒绝 */
export function requireText(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== 'string') throw new ValidationError(`${field}必须是字符串`)
  const text = value.trim()
  if (text === '') throw new ValidationError(`${field}不能为空`)
  if (text.length > maxLength) throw new ValidationError(`${field}不能超过 ${maxLength} 个字符`)
  return text
}

/**
 * 可选文本。
 * 返回 undefined 表示请求没带这个字段（保持原值），null 表示显式清空。
 */
export function optionalText(
  value: unknown,
  field: string,
  maxLength = 1000,
): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') throw new ValidationError(`${field}必须是字符串`)
  const text = value.trim()
  if (text === '') return null
  if (text.length > maxLength) throw new ValidationError(`${field}不能超过 ${maxLength} 个字符`)
  return text
}

/** 必填网址：裸域名会补上 https:// */
export function requireUrl(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new ValidationError(`${field}必须是字符串`)
  const url = normalizeUrl(value)
  if (url === null) throw new ValidationError(`${field}不是有效的网址`)
  return url
}

export function optionalUrl(
  value: unknown,
  field: string,
): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') throw new ValidationError(`${field}必须是字符串`)
  if (value.trim() === '') return null
  return requireUrl(value, field)
}

/** 字符串数组，不允许重复元素 */
export function requireIdList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ValidationError(`${field}必须是字符串数组`)
  }
  const ids = value as string[]
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError(`${field}里存在重复的 id`)
  }
  return ids
}
