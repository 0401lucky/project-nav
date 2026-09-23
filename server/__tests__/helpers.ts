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

export { createApp }
