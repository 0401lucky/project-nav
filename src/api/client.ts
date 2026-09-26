// 唯一的 HTTP 出口。组件不直接 fetch：
// 统一在这里处理错误形状、204 空响应和 401。

import type {
  ApiError as ApiErrorBody,
  Bookmark,
  BootstrapResponse,
  Group,
  IconRefreshResponse,
  ImportResult,
  MetaResponse,
  MissingIconReport,
  Settings,
  Wallpaper,
} from '@/types'

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
  // FormData 交给运行时自己设 Content-Type，才能带上 multipart 边界
  const isForm = body instanceof FormData
  const response = await fetch(path, {
    method,
    headers: body === undefined || isForm ? undefined : { 'Content-Type': 'application/json' },
    body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
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

/** 把任意异常翻成给用户看的一句话。两个 store 共用，避免各写一份措辞不同的版本。 */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message
  if (error instanceof UnauthorizedError) return '登录已失效，请重新登录'
  return '操作失败，请稍后再试'
}

export interface BookmarkInput {
  groupId: string
  title: string
  url: string
  description?: string | null
  iconUrl?: string | null
}

export type BookmarkPatch = Partial<BookmarkInput>

export interface GroupInput {
  name: string
  icon?: string | null
}

export const api = {
  bootstrap: () => request<BootstrapResponse>('GET', '/api/bootstrap'),

  login: (password: string) =>
    request<void>('POST', '/api/auth/login', { password }, { sessionExpiryOn401: false }),

  logout: () => request<void>('POST', '/api/auth/logout'),

  meta: (url: string) => request<MetaResponse>('POST', '/api/meta', { url }),

  createGroup: (input: GroupInput) => request<Group>('POST', '/api/groups', input),
  updateGroup: (id: string, patch: Partial<GroupInput>) =>
    request<Group>('PATCH', `/api/groups/${encodeURIComponent(id)}`, patch),
  deleteGroup: (id: string, moveTo?: string) => {
    const query = moveTo === undefined ? '' : `?moveTo=${encodeURIComponent(moveTo)}`
    return request<void>('DELETE', `/api/groups/${encodeURIComponent(id)}${query}`)
  },
  orderGroups: (ids: string[]) => request<void>('PUT', '/api/groups/order', { ids }),

  createBookmark: (input: BookmarkInput) => request<Bookmark>('POST', '/api/bookmarks', input),
  updateBookmark: (id: string, patch: BookmarkPatch) =>
    request<Bookmark>('PATCH', `/api/bookmarks/${encodeURIComponent(id)}`, patch),
  deleteBookmark: (id: string) =>
    request<void>('DELETE', `/api/bookmarks/${encodeURIComponent(id)}`),
  getBookmark: (id: string) => request<Bookmark>('GET', `/api/bookmarks/${encodeURIComponent(id)}`),
  refetchIcon: (id: string) =>
    request<IconRefreshResponse>('POST', `/api/bookmarks/${encodeURIComponent(id)}/icon/refetch`),
  /** 会把网址发给第三方图标服务，只能由用户点击触发 */
  publicIcon: (id: string) =>
    request<IconRefreshResponse>('POST', `/api/bookmarks/${encodeURIComponent(id)}/icon/public`),
  uploadIcon: (id: string, file: Blob) => {
    const form = new FormData()
    form.set('file', file)
    return request<IconRefreshResponse>('PUT', `/api/bookmarks/${encodeURIComponent(id)}/icon`, form)
  },
  refetchMissingIcons: () => request<MissingIconReport>('POST', '/api/bookmarks/icons/refetch-missing'),
  orderBookmarks: (groupId: string, ids: string[]) =>
    request<void>('PUT', '/api/bookmarks/order', { groupId, ids }),

  settings: () => request<Settings>('GET', '/api/settings'),
  patchSettings: (patch: Partial<Settings>) =>
    request<Settings>('PATCH', '/api/settings', patch),

  uploadWallpaper: (file: File) => {
    const form = new FormData()
    form.set('file', file)
    return request<Wallpaper>('POST', '/api/wallpapers', form)
  },
  deleteWallpaper: (id: string) =>
    request<void>('DELETE', `/api/wallpapers/${encodeURIComponent(id)}`),

  importHtml: (file: File) => {
    const form = new FormData()
    form.set('file', file)
    return request<ImportResult>('POST', '/api/import/html', form)
  },
  /** 旧站 JSON 直接当请求体发，服务端同时接受裸数组与 { items: [...] } */
  importLegacy: (payload: unknown) =>
    request<ImportResult>('POST', '/api/import/legacy', payload),
}
