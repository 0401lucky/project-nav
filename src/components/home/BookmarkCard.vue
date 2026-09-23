<script setup lang="ts">
import { computed, ref } from 'vue'
import FallbackIcon from '@/components/ui/FallbackIcon.vue'
import type { Bookmark } from '@/types'

const props = defineProps<{ bookmark: Bookmark }>()

/** 图标文件可能已被清掉，加载失败就退回色块，不显示裂图 */
const iconFailed = ref(false)

const showIcon = computed(() => props.bookmark.hasIcon && !iconFailed.value)

/**
 * 带 updatedAt 作缓存键：图标文件路径固定，靠这个参数让换图标后能立刻取到新图，
 * 服务端也就能对图标用长期不可变缓存。
 */
const iconSrc = computed(() => `/icons/${props.bookmark.id}.webp?v=${props.bookmark.updatedAt}`)
</script>

<template>
  <a
    class="card"
    :href="bookmark.url"
    target="_blank"
    rel="noopener noreferrer"
    :title="bookmark.description ?? bookmark.url"
  >
    <img
      v-if="showIcon"
      class="card__icon"
      :src="iconSrc"
      alt=""
      width="32"
      height="32"
      loading="lazy"
      decoding="async"
      @error="iconFailed = true"
    />
    <FallbackIcon v-else :title="bookmark.title" :url="bookmark.url" :size="32" />

    <span class="card__title">{{ bookmark.title }}</span>
  </a>
</template>

<style scoped>
.card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 9px 11px;
  background: var(--glass-card);
  border: 1px solid transparent;
  border-radius: var(--r-card);
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease),
    transform var(--dur) var(--ease);
}

.card:hover {
  background: var(--glass-card-hover);
  border-color: var(--stroke);
  transform: translateY(-1px);
}

.card__icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  object-fit: cover;
  flex: 0 0 auto;
}

/* 两行截断：长标题不至于把卡片撑高，也不至于只剩一个词 */
.card__title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 13px;
  line-height: 1.35;
  word-break: break-word;
}
</style>
