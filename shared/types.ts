// 前后端共享的 API 契约类型。
// 服务端与前端都从这里取，避免两侧各自定义一份导致契约漂移（见 cross-layer-thinking-guide）。

export interface Group {
  id: string
  name: string
  icon: string | null
  sortOrder: number
}

export interface Bookmark {
  id: string
  groupId: string
  title: string
  url: string
  description: string | null
  /** 图标是否已缓存在本站，前端据此决定显示图标还是首字色块 */
  hasIcon: boolean
  sortOrder: number
  /**
   * 最后修改时间（Unix ms）。图标落盘也会刷新它，
   * 前端用 /icons/{id}.webp?v={updatedAt} 作缓存键，图标换了就能立刻感知。
   */
  updatedAt: number
}

export type WallpaperOrientation = 'landscape' | 'portrait'

export interface Wallpaper {
  id: string
  builtin: boolean
  orientation: WallpaperOrientation
  /** 横竖配对：同一主题的横版与竖版共用此 id */
  pairId: string | null
  /**
   * 实际产出的档位宽度（从大到小），前端据此拼 srcset。
   * 内置壁纸来自 manifest，上传壁纸来自服务端转码结果——宽度是每张图的实际属性，
   * 不能在前端写死。
   */
  widths: number[]
}

export interface SearchEngine {
  name: string
  /** 含 %s 占位符的搜索地址模板 */
  template: string
}

export interface Settings {
  wallpaper: string
  searchEngine: SearchEngine
  accent: string
  /** 只读，服务端首次启动生成 */
  bookmarkletToken: string
}

export interface BootstrapResponse {
  groups: Group[]
  bookmarks: Bookmark[]
  settings: Settings
  wallpapers: Wallpaper[]
}

export interface ApiError {
  error: string
  detail?: string
}

export interface MetaResponse {
  finalUrl: string
  title?: string
  description?: string
  iconCandidates: string[]
  /** 抓取失败时的原因，此时其余字段为空但仍是 200 */
  error?: string
}

export interface ImportResult {
  groups: number
  bookmarks: number
}

/** 编辑面板里重抓 / 上传 / 公共服务的结果：失败时 bookmark 保持原样，error 给出原因 */
export interface IconRefreshResponse {
  bookmark: Bookmark
  error?: string
}

export interface MissingIconFailure {
  id: string
  title: string
  reason: string
}

export interface MissingIconReport {
  total: number
  succeeded: number
  failed: MissingIconFailure[]
}
