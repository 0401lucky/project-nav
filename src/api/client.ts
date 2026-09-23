// 唯一的 HTTP 出口。组件不直接 fetch：
// 统一在这里处理错误形状、204 空响应和 401。

import type { ApiError as ApiErrorBody, BootstrapResponse } from '@/types'

export class UnauthorizedError extends Error {
  constructor() {
    super('未登录')
    this.name = 'UnauthorizedError'
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly detail: string | undefined

  constructor(status: number, message: string, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

interface RequestOptions {
  /**
   * 401 是否表示"会话失效"（默认 true）。
   *
   * 登录接口必须传 false：那里 401 是「密码错误」，属于普通业务错误。
   * 两者混在一起会把密码错误吞成"掉线"，用户看到的就是错误的提示。
   */
  sessionExpiryOn401?: boolean
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 401 && options.sessionExpiryOn401 !== false) {
    throw new UnauthorizedError()
  }

  if (!response.ok) {
    const payload = await readErrorBody(response)
    throw new ApiError(
      response.status,
      payload?.error ?? `请求失败（${response.status}）`,
      payload?.detail,
    )
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

async function readErrorBody(response: Response): Promise<ApiErrorBody | null> {
  try {
    return (await response.json()) as ApiErrorBody
  } catch {
    return null
  }
}

export const api = {
  bootstrap: () => request<BootstrapResponse>('GET', '/api/bootstrap'),
  login: (password: string) =>
    request<void>('POST', '/api/auth/login', { password }, { sessionExpiryOn401: false }),
  logout: () => request<void>('POST', '/api/auth/logout'),
}
