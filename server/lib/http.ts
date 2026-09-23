// 路由层的通用 HTTP 工具：请求体解析与统一错误响应。

import type { Context } from 'hono'

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

/** 业务规则冲突，例如删除内置壁纸 */
export function forbidden(c: Context, error: string): Response {
  return c.json({ error }, 403)
}

export function noContent(c: Context): Response {
  return c.body(null, 204)
}

/** 从任意值里取出字符串，非字符串一律当空串处理 */
export function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
