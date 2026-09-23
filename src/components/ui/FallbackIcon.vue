<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  title: string
  url: string
  size?: number
}>()

const size = computed(() => props.size ?? 32)

/**
 * 域名哈希决定色相：同一个站点的兜底色块永远同一个颜色，
 * 一眼能认出是哪个站，而不是随机跳色。
 */
const hue = computed(() => {
  let host = props.url
  try {
    host = new URL(props.url).hostname
  } catch {
    /* 网址解析不了就用原串，总比没有颜色好 */
  }
  let hash = 0
  for (let i = 0; i < host.length; i += 1) {
    hash = (hash * 31 + host.charCodeAt(i)) % 360
  }
  return hash
})

/** 用展开取首字符，避免把 emoji 之类的代理对切成半个 */
const initial = computed(() => [...props.title.trim()][0] ?? '?')
</script>

<template>
  <span
    class="fallback-icon"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      background: `hsl(${hue} 55% 45%)`,
      fontSize: `${Math.round(size * 0.5)}px`,
    }"
    aria-hidden="true"
  >
    {{ initial }}
  </span>
</template>

<style scoped>
.fallback-icon {
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: rgb(255 255 255 / 0.95);
  font-weight: 600;
  line-height: 1;
  user-select: none;
}
</style>
