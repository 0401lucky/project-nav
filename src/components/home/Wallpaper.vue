<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { Wallpaper } from '@/types'

const settings = useSettingsStore()

/** 大图加载完之前先显示 LQIP，避免背景闪一下 */
const loaded = ref(false)

const current = computed(() => settings.currentWallpaper)

watch(
  () => current.value?.id,
  () => {
    loaded.value = false
  },
)

/** 档位缺失（脏数据）时只留 LQIP，不发出坏请求 */
const hasTiers = computed(() => (current.value?.widths.length ?? 0) > 0)

function sortedWidths(wallpaper: Wallpaper): number[] {
  return [...wallpaper.widths].sort((a, b) => b - a)
}

/** 先 avif 后 webp，各档用宽度描述符交给浏览器按视口和 DPR 挑 */
function srcsetOf(wallpaper: Wallpaper, format: 'avif' | 'webp'): string {
  return sortedWidths(wallpaper)
    .map((width) => `/wallpapers/${wallpaper.id}-${width}.${format} ${width}w`)
    .join(', ')
}

/** <img> 的兜底用最小档 webp：不支持 avif 的浏览器也拿得到图 */
const fallbackSrc = computed(() => {
  const wallpaper = current.value
  if (wallpaper === null || wallpaper.widths.length === 0) return ''
  const smallest = Math.min(...wallpaper.widths)
  return `/wallpapers/${wallpaper.id}-${smallest}.webp`
})

const lqipStyle = computed(() =>
  current.value === null
    ? {}
    : { backgroundImage: `url(/wallpapers/${current.value.id}-lqip.webp)` },
)
</script>

<template>
  <div class="wallpaper">
    <div class="wallpaper__lqip" :style="lqipStyle" aria-hidden="true" />

    <picture v-if="hasTiers">
      <!-- 竖版源放在前面：媒体查询命中时优先于后面的默认源 -->
      <source
        v-if="settings.portraitWallpaper"
        media="(orientation: portrait)"
        type="image/avif"
        :srcset="srcsetOf(settings.portraitWallpaper, 'avif')"
        sizes="100vw"
      />
      <source
        v-if="settings.portraitWallpaper"
        media="(orientation: portrait)"
        type="image/webp"
        :srcset="srcsetOf(settings.portraitWallpaper, 'webp')"
        sizes="100vw"
      />
      <source
        v-if="settings.landscapeWallpaper"
        type="image/avif"
        :srcset="srcsetOf(settings.landscapeWallpaper, 'avif')"
        sizes="100vw"
      />
      <source
        v-if="settings.landscapeWallpaper"
        type="image/webp"
        :srcset="srcsetOf(settings.landscapeWallpaper, 'webp')"
        sizes="100vw"
      />
      <img
        class="wallpaper__img"
        :class="{ 'is-loaded': loaded }"
        :src="fallbackSrc"
        alt=""
        decoding="async"
        fetchpriority="high"
        @load="loaded = true"
      />
    </picture>

    <div class="wallpaper__scrim" aria-hidden="true" />
  </div>
</template>

<style scoped>
.wallpaper {
  position: fixed;
  inset: 0;
  z-index: 0;
  background: #0b0d12;
}

.wallpaper__lqip,
.wallpaper__img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 32px 的低清图直接拉伸，再用 blur 抹掉像素块 */
.wallpaper__lqip {
  background-position: center;
  background-size: cover;
  filter: blur(20px);
  transform: scale(1.1);
}

.wallpaper__img {
  opacity: 0;
  transition: opacity 420ms var(--ease);
}

.wallpaper__img.is-loaded {
  opacity: 1;
}

/* 保证任何壁纸下文字都可读 */
.wallpaper__scrim {
  position: absolute;
  inset: 0;
  background: var(--scrim);
}
</style>
