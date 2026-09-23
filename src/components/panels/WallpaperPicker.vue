<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { Wallpaper, WallpaperOrientation } from '@/types'

const settings = useSettingsStore()

const fileInput = ref<HTMLInputElement | null>(null)

/**
 * 一个主题只出一个格子：横竖版按当前屏幕方向自动选，用户不需要自己挑。
 * 屏幕转方向时这里要跟着变，所以监听媒体查询而不是只读一次。
 */
const portrait = ref(false)
const query = window.matchMedia('(orientation: portrait)')

function syncOrientation(event: MediaQueryList | MediaQueryListEvent): void {
  portrait.value = event.matches
}
onMounted(() => {
  syncOrientation(query)
  query.addEventListener('change', syncOrientation)
})
onBeforeUnmount(() => query.removeEventListener('change', syncOrientation))

/**
 * 必须是 computed：写成普通常量就只在 setup 时求值一次，
 * 屏幕转方向后 tiles 不会重算，会一直给旧方向那一版。
 */
const preferred = computed<WallpaperOrientation>(() =>
  portrait.value ? 'portrait' : 'landscape',
)

/** 每个主题挑一张代表：优先当前方向，没有就用另一方向 */
const tiles = computed<Wallpaper[]>(() => {
  const byTheme = new Map<string, Wallpaper[]>()
  for (const item of settings.wallpapers) {
    const key = item.pairId ?? item.id
    const bucket = byTheme.get(key)
    if (bucket === undefined) byTheme.set(key, [item])
    else bucket.push(item)
  }

  return [...byTheme.values()].map(
    (group) =>
      group.find((item) => item.orientation === preferred.value) ?? (group[0] as Wallpaper),
  )
})

/** 缩略图用最小档，省流量 */
function thumbSrc(wallpaper: Wallpaper): string {
  const widths = wallpaper.widths.filter((width) => width > 0)
  const smallest = widths.length === 0 ? 0 : Math.min(...widths)
  return smallest === 0
    ? `/wallpapers/${wallpaper.id}-lqip.webp`
    : `/wallpapers/${wallpaper.id}-${smallest}.webp`
}

/** 选中某个主题的任意一版都算选中该主题（横竖是自动配的） */
function isCurrent(wallpaper: Wallpaper): boolean {
  const current = settings.currentWallpaper
  if (current === null) return false
  return current.id === wallpaper.id || (wallpaper.pairId !== null && wallpaper.pairId === current.pairId)
}

async function onPickFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  // 先清空 input，这样连续选同一个文件也能再次触发 change
  input.value = ''
  if (file !== undefined) await settings.uploadWallpaper(file)
}
</script>

<template>
  <div class="picker">
    <div class="grid">
      <!-- 选择与删除是并列的两个按钮：按钮里再嵌按钮是非法结构 -->
      <div v-for="tile in tiles" :key="tile.id" class="cell">
        <button
          class="tile"
          :class="{ 'is-current': isCurrent(tile) }"
          type="button"
          :title="tile.builtin ? '内置壁纸' : '我上传的'"
          :aria-label="tile.builtin ? `选择内置壁纸 ${tile.pairId}` : '选择我上传的壁纸'"
          @click="settings.selectWallpaper(tile.id)"
        >
          <img :src="thumbSrc(tile)" alt="" loading="lazy" decoding="async" />
          <span v-if="!tile.builtin" class="tile__badge" aria-hidden="true">自定义</span>
        </button>

        <button
          v-if="!tile.builtin"
          class="tile__remove"
          type="button"
          aria-label="删除这张壁纸"
          @click="settings.removeWallpaper(tile.id)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>

    <div class="upload">
      <button class="btn" type="button" :disabled="settings.saving" @click="fileInput?.click()">
        {{ settings.saving ? '处理中…' : '上传图片' }}
      </button>
      <p class="field__hint">JPEG / PNG / WebP / AVIF，不超过 10MB</p>
      <input
        ref="fileInput"
        class="upload__input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        @change="onPickFile"
      />
    </div>
  </div>
</template>

<style scoped>
.picker {
  display: grid;
  gap: 12px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.cell {
  position: relative;
}

.tile {
  display: block;
  width: 100%;
  overflow: hidden;
  aspect-ratio: 16 / 10;
  background: rgb(0 0 0 / 0.3);
  border: 1px solid var(--stroke);
  border-radius: 10px;
  transition: border-color var(--dur) var(--ease);
}

.tile img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tile:hover {
  border-color: var(--stroke-strong);
}

.tile.is-current {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.tile__badge {
  position: absolute;
  left: 4px;
  bottom: 4px;
  padding: 1px 5px;
  font-size: 10px;
  color: var(--text);
  background: rgb(0 0 0 / 0.6);
  border-radius: var(--r-pill);
}

.tile__remove {
  position: absolute;
  top: 4px;
  right: 4px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  color: var(--text);
  background: rgb(0 0 0 / 0.6);
  border-radius: var(--r-pill);
  opacity: 0;
  transition: opacity var(--dur) var(--ease);
}

.cell:hover .tile__remove {
  opacity: 1;
}

.tile__remove:hover {
  background: rgb(200 60 60 / 0.85);
}

.upload {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 文件选择靠按钮触发，原生控件藏起来 */
.upload__input {
  display: none;
}
</style>
