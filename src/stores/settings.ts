// 设置与壁纸清单。
//
// 壁纸的选择模型：settings.wallpaper 存的是 wallpapers 表里的行 id。
// 用户选中的那一行可能带 pairId（内置壁纸横竖成对），此时按屏幕方向
// 从同一 pairId 里挑对应的一张；上传的壁纸没有 pairId，就只有自己。

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { BootstrapResponse, SearchEngine, Settings, Wallpaper, WallpaperOrientation } from '@/types'

/** 与 scripts/build-wallpapers.ts 写出的 manifest.json 对应 */
interface WallpaperManifestEntry {
  id: string
  orientation: WallpaperOrientation
  pairId: string | null
  widths: number[]
}

export const FALLBACK_SEARCH_ENGINE: SearchEngine = {
  name: 'Google',
  template: 'https://www.google.com/search?q=%s',
}

export const useSettingsStore = defineStore('settings', () => {
  const wallpaper = ref('')
  const searchEngine = ref<SearchEngine>({ ...FALLBACK_SEARCH_ENGINE })
  const accent = ref('#e8c87a')
  const bookmarkletToken = ref('')

  const wallpapers = ref<Wallpaper[]>([])

  /** 用户选中的那一行；没选过或已被删时回落到第一张，首屏就不会没有背景 */
  const currentWallpaper = computed<Wallpaper | null>(() => {
    const selected = wallpapers.value.find((item) => item.id === wallpaper.value)
    return selected ?? wallpapers.value[0] ?? null
  })

  /** 取某个方向的壁纸：选中项本身就是就返回它，否则从同一 pairId 里找 */
  function atOrientation(orientation: WallpaperOrientation): Wallpaper | null {
    const current = currentWallpaper.value
    if (current === null) return null
    if (current.orientation === orientation) return current
    if (current.pairId === null) return null
    return (
      wallpapers.value.find(
        (item) => item.pairId === current.pairId && item.orientation === orientation,
      ) ?? null
    )
  }

  /** 各方向实际要显示的那张；选中项没有该方向的配对时为 null */
  const portraitWallpaper = computed(() => atOrientation('portrait'))

  const landscapeWallpaper = computed(() => atOrientation('landscape'))

  const applyBootstrap = (payload: BootstrapResponse): void => {
    applySettings(payload.settings)
    wallpapers.value = payload.wallpapers
  }

  /**
   * 登录屏也要有壁纸，但壁纸清单正常是随 /api/bootstrap 一起下发的（需要鉴权）。
   * manifest.json 是构建产物里的公开静态文件，内容只有 id、方向、档位宽度，
   * 没有任何敏感信息，所以未登录时用它兜底。
   * 不给它开公开 API——prd 要求未登录访问任何 API 都被拒绝。
   */
  async function loadPublicManifest(): Promise<void> {
    if (wallpapers.value.length > 0) return
    try {
      const response = await fetch('/wallpapers/manifest.json')
      if (!response.ok) return
      const manifest = (await response.json()) as { wallpapers?: unknown }
      if (!Array.isArray(manifest.wallpapers)) return
      wallpapers.value = (manifest.wallpapers as WallpaperManifestEntry[]).map((entry) => ({
        id: entry.id,
        builtin: true,
        orientation: entry.orientation,
        pairId: entry.pairId,
        widths: entry.widths,
      }))
    } catch {
      /* 拿不到就只是没有背景，不影响登录 */
    }
  }

  function applySettings(next: Settings): void {
    wallpaper.value = next.wallpaper
    searchEngine.value = next.searchEngine
    accent.value = next.accent
    bookmarkletToken.value = next.bookmarkletToken
  }

  /** 退出登录时清掉敏感与个性化字段；壁纸清单是公开构建产物，留着给登录屏当背景 */
  function reset(): void {
    wallpaper.value = ''
    searchEngine.value = { ...FALLBACK_SEARCH_ENGINE }
    accent.value = '#e8c87a'
    bookmarkletToken.value = ''
  }

  return {
    wallpaper,
    searchEngine,
    accent,
    bookmarkletToken,
    wallpapers,
    currentWallpaper,
    portraitWallpaper,
    landscapeWallpaper,
    applyBootstrap,
    applySettings,
    loadPublicManifest,
    reset,
  }
})
