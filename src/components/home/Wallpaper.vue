<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { Wallpaper } from '@/types'

const settings = useSettingsStore()

/**
 * 屏幕方向。LQIP 只渲染需要的那一层：
 * 渲染两层再用 CSS 的 display:none 隐藏是不行的——内联的 background-image
 * 会在样式计算之前就发起加载，横版占位图照样会被请求（实测过）。
 * display:none 只挡住绘制，挡不住网络请求。
 */
const orientationQuery = window.matchMedia('(orientation: portrait)')
const portraitNow = ref(orientationQuery.matches)

function syncOrientation(event: MediaQueryList | MediaQueryListEvent): void {
  portraitNow.value = event.matches
}
onMounted(() => orientationQuery.addEventListener('change', syncOrientation))
onBeforeUnmount(() => orientationQuery.removeEventListener('change', syncOrientation))

/** 大图加载完之前先显示 LQIP，避免背景闪一下 */
const loaded = ref(false)

const current = computed(() => settings.currentWallpaper)

/** 默认源：有横版就用横版，否则就是选中项本身（比如没有配对的竖版上传图） */
const base = computed(() => settings.landscapeWallpaper ?? current.value)

/** 竖屏专用源：只在竖版与默认源不是同一张时才需要 */
const portrait = computed(() => {
  const candidate = settings.portraitWallpaper
  return candidate !== null && candidate.id !== base.value?.id ? candidate : null
})

watch(
  () => current.value?.id,
  () => {
    loaded.value = false
  },
)

/** 档位缺失（脏数据）时只留 LQIP，不发出坏请求 */
const hasTiers = computed(() => (base.value?.widths.length ?? 0) > 0)

function sortedWidths(wallpaper: Wallpaper): number[] {
  return [...wallpaper.widths].sort((a, b) => b - a)
}

/** 先 avif 后 webp，各档用宽度描述符交给浏览器按视口和 DPR 挑 */
function srcsetOf(wallpaper: Wallpaper, format: 'avif' | 'webp'): string {
  return sortedWidths(wallpaper)
    .map((width) => `/wallpapers/${wallpaper.id}-${width}.${format} ${width}w`)
    .join(', ')
}

/** <img> 的兜底用最小档 webp：只有不认识 <source> 的浏览器才会用到 */
const fallbackSrc = computed(() => {
  const wallpaper = base.value
  if (wallpaper === null || wallpaper.widths.length === 0) return ''
  const smallest = Math.min(...wallpaper.widths)
  return `/wallpapers/${wallpaper.id}-${smallest}.webp`
})

/**
 * 占位图必须跟着主图的方向走。
 * 之前只有一层、固定用 base（横版）的 LQIP，竖屏下就出现「模糊底是横版、
 * 主图是竖版」的方向错配——32px 模糊看不出来，但确实是错的，
 * 而且会白白多发一个横版请求。
 */
function lqipUrl(wallpaper: Wallpaper | null): string {
  return wallpaper === null ? '' : `url(/wallpapers/${wallpaper.id}-lqip.webp)`
}

/** 竖屏且有竖版配对时用竖版的占位图，否则用默认源那层 */
const usePortraitLqip = computed(() => portraitNow.value && portrait.value !== null)

const lqipStyle = computed(() => {
  const target = usePortraitLqip.value ? portrait.value : base.value
  const url = lqipUrl(target)
  return url === '' ? {} : { backgroundImage: url }
})
</script>

<template>
  <div class="wallpaper">
    <div class="wallpaper__lqip" :style="lqipStyle" aria-hidden="true" />

    <picture v-if="base !== null && hasTiers">
      <!-- 竖版源放在前面：媒体查询命中时优先于后面的默认源 -->
      <source
        v-if="portrait"
        media="(orientation: portrait)"
        type="image/avif"
        :srcset="srcsetOf(portrait, 'avif')"
        sizes="100vw"
      />
      <source
        v-if="portrait"
        media="(orientation: portrait)"
        type="image/webp"
        :srcset="srcsetOf(portrait, 'webp')"
        sizes="100vw"
      />
      <!-- 默认源必须始终存在：<img> 只有兜底 src、没有 srcset，落到它就只剩最小档 -->
      <source type="image/avif" :srcset="srcsetOf(base, 'avif')" sizes="100vw" />
      <source type="image/webp" :srcset="srcsetOf(base, 'webp')" sizes="100vw" />
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
