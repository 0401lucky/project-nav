<script setup lang="ts">
import { computed } from 'vue'
import { hueOf, initialOf } from '@/composables/labels'

const props = defineProps<{
  title: string
  url: string
  /**
   * 边长（px）。不传就不写行内尺寸，交给父组件的 class 决定——
   * 卡片在桌面端和窄屏尺寸不同，行内写死的话媒体查询覆盖不了。
   */
  size?: number
}>()

const hue = computed(() => hueOf(props.url))
const initial = computed(() => initialOf(props.title))

/** 低饱和：底色压暗、字母带同色调，和真实图标混排时不显得乱 */
const style = computed(() => ({
  color: `hsl(${hue.value} 55% 84%)`,
  background: `hsl(${hue.value} 26% 28%)`,
  ...(props.size === undefined
    ? {}
    : {
        width: `${props.size}px`,
        height: `${props.size}px`,
        fontSize: `${Math.round(props.size * 0.5)}px`,
      }),
}))
</script>

<template>
  <span class="fallback-icon" :style="style" aria-hidden="true">{{ initial }}</span>
</template>

<style scoped>
.fallback-icon {
  display: grid;
  place-items: center;
  border-radius: 8px;
  font-weight: 600;
  line-height: 1;
  user-select: none;
}
</style>
