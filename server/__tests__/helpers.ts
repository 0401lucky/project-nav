// 测试公共装置：内存库 + 固定配置的 app，不监听端口。

import { createApp } from '../app.ts'
import { createDb } from '../db.ts'
import type { AppDeps } from '../types.ts'

export const TEST_PASSWORD = 'open-sesame'
export const TEST_SECRET = 'test-secret-'.padEnd(48, 'x')

export function testDeps(): AppDeps {
  return {
    db: createDb(':memory:'),
    config: {
      password: TEST_PASSWORD,
      sessionSecret: TEST_SECRET,
      port: 0,
      dataDir: ':memory:',
      secureCookies: false,
    },
    // 全部指向不存在的路径：静态资源 handler 会被跳过，测试只关心 API
    paths: {
      root: ':memory:',
      dbFile: ':memory:',
      iconsDir: ':memory:/icons',
      wallpapersDir: ':memory:/wallpapers',
    },
  }
}

export function jsonPost(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

/** 从 Set-Cookie 里取出 `名字=值` 这一段，供后续请求手动带上 */
export function cookiePair(response: Response): string {
  const raw = response.headers.get('set-cookie')
  if (raw === null) throw new Error('响应里没有 Set-Cookie')
  return raw.split(';')[0] ?? ''
}

export async function login(deps: AppDeps, password = TEST_PASSWORD): Promise<string> {
  const app = createApp(deps)
  const response = await app.request('/api/auth/login', jsonPost({ password }))
  if (response.status !== 204) {
    throw new Error(`登录失败，状态码 ${response.status}`)
  }
  return cookiePair(response)
}

export interface ApiClient {
  get(path: string): Promise<Response>
  post(path: string, body?: unknown): Promise<Response>
  put(path: string, body?: unknown): Promise<Response>
  patch(path: string, body?: unknown): Promise<Response>
  del(path: string): Promise<Response>
}

export function apiClient(deps: AppDeps, cookie: string): ApiClient {
  const app = createApp(deps)
  const headers = { 'Content-Type': 'application/json', Cookie: cookie }
  const send = async (method: string, path: string, body?: unknown): Promise<Response> =>
    await app.request(path, body === undefined ? { method, headers } : { method, headers, body: JSON.stringify(body) })

  return {
    get: (path) => send('GET', path),
    post: (path, body) => send('POST', path, body),
    put: (path, body) => send('PUT', path, body),
    patch: (path, body) => send('PATCH', path, body),
    del: (path) => send('DELETE', path),
  }
}

/** 登录好的客户端，配合内存库使用 */
export async function authedClient(): Promise<{ deps: AppDeps; api: ApiClient }> {
  const deps = testDeps()
  const api = apiClient(deps, await login(deps))
  return { deps, api }
}

export async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

export { createApp }
