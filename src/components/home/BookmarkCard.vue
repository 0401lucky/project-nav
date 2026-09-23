<script lang="ts">
import { ref } from 'vue'

/**
 * 同一时刻只开一个卡片菜单，所以开关状态放在模块级、所有卡片共享。
 * 打开菜单的点击必须 stopPropagation（否则冒泡到 document 会立刻被收起），
 * 这也让「点别处收起」对另一张卡片的「更多」按钮失效，只能靠这份共享状态互斥。
 */
const openMenuId = ref<string | null>(null)
</script>

<script setup lang="ts">
// ref 已由上面的普通 <script> 导入，两块同处一个模块作用域，重复导入会报错
import { computed, onBeforeUnmount, watch } from 'vue'
import FallbackIcon from '@/components/ui/FallbackIcon.vue'
import { splitByHighlights } from '@/composables/filter'
import type { HighlightRange } from '@/composables/filter'
import type { Bookmark } from '@/types'

const props = defineProps<{
  bookmark: Bookmark
  /** 当前搜索命中的标题区间，未搜索时为空 */
  highlight?: HighlightRange[]
  /** 拖拽手柄的事件绑定；不传就不显示手柄（触屏、搜索结果里都不需要） */
  drag?: {
    onStart: (event: DragEvent) => void
    onEnd: () => void
  }
}>()

const emit = defineEmits<{ edit: []; remove: []; move: [] }>()

/** 图标文件可能已被清掉，加载失败就退回色块，不显示裂图 */
const iconFailed = ref(false)

const showIcon = computed(() => props.bookmark.hasIcon && !iconFailed.value)

/**
 * 带 updatedAt 作缓存键：图标文件路径固定，靠这个参数让换图标后能立刻取到新图，
 * 服务端也就能对图标用长期不可变缓存。
 */
const iconSrc = computed(() => `/icons/${props.bookmark.id}.webp?v=${props.bookmark.updatedAt}`)

const titleParts = computed(() => splitByHighlights(props.bookmark.title, props.highlight ?? []))

const menuOpen = computed(() => openMenuId.value === props.bookmark.id)
const moreButton = ref<HTMLElement | null>(null)
/** fixed 定位相对视口，直接存最终坐标 */
const anchor = ref({ top: 0, right: 0 })

/**
 * 菜单必须 Teleport 到 body。
 * 分组面板用了 backdrop-filter，因而各自是一个独立的层叠上下文——
 * 菜单留在卡片里时，z-index 只在所属面板内部比较，
 * DOM 里更靠后的面板会整块盖在它上面，调多大都没用。
 */
function openMenu(event?: MouseEvent): void {
  event?.preventDefault()
  event?.stopPropagation()

  const rect = moreButton.value?.getBoundingClientRect()
  if (rect === undefined) return

  anchor.value = {
    top: rect.bottom + 6,
    right: Math.max(8, window.innerWidth - rect.right),
  }
  openMenuId.value = props.bookmark.id
}

function close(): void {
  if (menuOpen.value) openMenuId.value = null
}

function choose(action: () => void): void {
  close()
  action()
}

// fixed 定位不跟随滚动，所以滚动、改窗口大小、点别处都直接收起
function dismiss(): void {
  close()
}

/** 挂在 document 上，先于 window 上的全局快捷键收到：Esc 只收菜单，不再清空搜索 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  close()
}

watch(menuOpen, (open) => {
  if (open) {
    document.addEventListener('click', dismiss)
    document.addEventListener('keydown', onKeydown)
    window.addEventListener('scroll', dismiss, { passive: true, capture: true })
    window.addEventListener('resize', dismiss)
  } else {
    document.removeEventListener('click', dismiss)
    document.removeEventListener('keydown', onKeydown)
    window.removeEventListener('scroll', dismiss, { capture: true })
    window.removeEventListener('resize', dismiss)
  }
})

onBeforeUnmount(() => {
  close()
  document.removeEventListener('click', dismiss)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', dismiss, { capture: true })
  window.removeEventListener('resize', dismiss)
})
</script>

<template>
  <!-- 不能靠 mouseleave 收起：菜单已 Teleport 到 body，指针移向菜单就算离开了卡片 -->
  <div class="card-wrap">
    <a
      class="card"
      :href="bookmark.url"
      target="_blank"
      rel="noopener noreferrer"
      :title="bookmark.description ?? bookmark.url"
      @contextmenu="openMenu"
    >
      <span
        v-if="drag"
        class="card__handle"
        draggable="true"
        role="button"
        tabindex="-1"
        aria-label="拖动排序"
        title="拖动排序"
        @dragstart="drag.onStart"
        @dragend="drag.onEnd"
        @click.prevent.stop
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
          <circle cx="2.5" cy="3" r="1.3" />
          <circle cx="7.5" cy="3" r="1.3" />
          <circle cx="2.5" cy="7" r="1.3" />
          <circle cx="7.5" cy="7" r="1.3" />
          <circle cx="2.5" cy="11" r="1.3" />
          <circle cx="7.5" cy="11" r="1.3" />
        </svg>
      </span>

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

      <span class="card__title">
        <template v-for="(part, index) in titleParts" :key="index"
          ><mark v-if="part.hit" class="card__hit">{{ part.text }}</mark
          ><template v-else>{{ part.text }}</template
        ></template>
      </span>

      <button
        ref="moreButton"
        class="card__more"
        type="button"
        aria-label="更多操作"
        :aria-expanded="menuOpen"
        @click="openMenu"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
    </a>
  </div>

  <Teleport to="body">
    <div
      v-if="menuOpen"
      class="card-menu"
      role="menu"
      :style="{ top: `${anchor.top}px`, right: `${anchor.right}px` }"
    >
      <button class="card-menu__item" type="button" role="menuitem" @click="choose(() => emit('edit'))">
        编辑
      </button>
      <button class="card-menu__item" type="button" role="menuitem" @click="choose(() => emit('move'))">
        移到分组
      </button>
      <button
        class="card-menu__item card-menu__item--danger"
        type="button"
        role="menuitem"
        @click="choose(() => emit('remove'))"
      >
        删除
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.card-wrap {
  position: relative;
  min-width: 0;
}

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

/* 拖拽手柄平时不占视觉重量，悬停才显形 */
.card__handle {
  display: grid;
  place-items: center;
  width: 12px;
  margin-left: -4px;
  color: var(--text-3);
  opacity: 0;
  cursor: grab;
  transition: opacity var(--dur) var(--ease);
}

.card:hover .card__handle {
  opacity: 1;
}

.card__handle:active {
  cursor: grabbing;
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
  flex: 1 1 auto;
  font-size: 13px;
  line-height: 1.35;
  word-break: break-word;
}

/* 命中片段标黄：用强调色加下划线，不改变文字颜色以免在暗底上失真 */
.card__hit {
  color: inherit;
  background: none;
  border-bottom: 1.5px solid var(--accent);
  font-weight: 600;
}

.card__more {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  border-radius: 8px;
  color: var(--text-3);
  opacity: 0;
  transition: opacity var(--dur) var(--ease), background var(--dur) var(--ease);
}

.card:hover .card__more,
.card__more[aria-expanded='true'] {
  opacity: 1;
}

.card__more:hover {
  background: rgb(255 255 255 / 0.14);
  color: var(--text);
}

.card-menu {
  /* 已 Teleport 到 body，用 fixed 定位并按按钮坐标摆放，跳出分组面板的层叠上下文 */
  position: fixed;
  z-index: 60;
  display: grid;
  min-width: 132px;
  padding: 4px;
  background: rgb(26 30 38 / 0.94);
  border: 1px solid var(--stroke);
  border-radius: 12px;
  backdrop-filter: blur(var(--blur-panel));
  box-shadow: 0 14px 34px rgb(0 0 0 / 0.5);
}

.card-menu__item {
  padding: 7px 10px;
  font-size: 13px;
  text-align: left;
  border-radius: 8px;
  transition: background var(--dur) var(--ease);
}

.card-menu__item:hover {
  background: rgb(255 255 255 / 0.12);
}

.card-menu__item--danger {
  color: rgb(255 180 180);
}

.card-menu__item--danger:hover {
  background: rgb(220 80 80 / 0.22);
}
@media (max-width: 640px) {
  /* 触屏没有 hover，手柄永远不会显形，直接不占位（prd 把移动端拖拽列为不在范围内） */
  .card__handle {
    display: none;
  }

  /* 竖排：3 列时卡片只有约 100px 宽，横排会把标题挤没。
     菜单按钮改为浮在右上角，不再参与横向布局。 */
  .card {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 8px;
  }

  /* 靠 hover 显形的按钮在触屏上永远点不到，必须常显 */
  .card__more {
    position: absolute;
    top: 4px;
    right: 4px;
    opacity: 1;
    background: rgb(0 0 0 / 0.35);
  }
}
</style>
