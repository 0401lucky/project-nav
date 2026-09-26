// 前端类型统一从共享契约再导出。
// 只有一份定义（shared/types.ts），这里只是给 src 内部一个稳定的引用位置，
// 避免每个组件都写 ../../shared/types 这种相对路径。

export type {
  ApiError,
  Bookmark,
  BootstrapResponse,
  Group,
  IconRefreshResponse,
  ImportResult,
  MetaResponse,
  MissingIconReport,
  SearchEngine,
  Settings,
  Wallpaper,
  WallpaperOrientation,
} from '../shared/types'
