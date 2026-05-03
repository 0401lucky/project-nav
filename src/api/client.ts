import type { ApiError } from '@/types'

const TOKEN_KEY = 'nav-aurora.token'

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore quota errors */
  }
}

export class ApiCallError extends Error {
  constructor(
    public status: number,
    public payload: ApiError,
  ) {
    super(payload.error || `HTTP ${status}`)
  }
}

interface CallOptions {
  auth?: boolean
  signal?: AbortSignal
}

async function call<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  opts: CallOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.auth) {
    const token = readToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  let resp: Response
  try {
    resp = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: opts.signal,
    })
  } catch (e) {
    throw new ApiCallError(0, {
      error: '网络异常',
      detail: (e as Error).message,
    })
  }

  if (resp.status === 204) return undefined as T

  const text = await resp.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: text }
    }
  }

  if (!resp.ok) {
    const payload =
      (data as ApiError) ?? { error: `HTTP ${resp.status}` }
    throw new ApiCallError(resp.status, payload)
  }
  return data as T
}

export const api = {
  get: <T>(path: string, opts?: CallOptions) => call<T>('GET', path, undefined, opts),
  post: <T>(path: string, body: unknown, opts?: CallOptions) =>
    call<T>('POST', path, body, opts),
  put: <T>(path: string, body: unknown, opts?: CallOptions) =>
    call<T>('PUT', path, body, opts),
  del: <T>(path: string, opts?: CallOptions) => call<T>('DELETE', path, undefined, opts),
}
