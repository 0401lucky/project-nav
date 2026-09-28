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
import { displayHost, titleKey } from '@/composables/labels'
import { useDataStore } from '@/stores/data'
import type { Bookmark } from '@/types'

const props = defineProps<{
  bookmark: Bookmark
  /** 当前搜索命中的标题区间，未搜索时为空 */
  highlight?: HighlightRange[]
  /** 整张卡片的拖拽事件绑定；不传就不可拖（窄屏、搜索结果里都不给拖） */
  drag?: {
    onStart: (event: DragEvent) => void
    onEnd: () => void
  }
  /** 搜索框里 ↑↓ 选中的当前项，回车会打开它 */
  active?: boolean
}>()

const emit = defineEmits<{ edit: []; remove: []; move: [groupId: string] }>()

const data = useDataStore()

/** 菜单里可以移过去的分组：除当前分组外的全部；只有一个分组时为空，整节不显示 */
const moveTargets = computed(() => data.groups.filter((group) => group.id !== props.bookmark.groupId))

const card = ref<HTMLElement | null>(null)
/** 拖动中降低不透明度，代替原来手柄上的视觉反馈 */
const dragging = ref(false)

function onDragStart(event: DragEvent): void {
  // 不可拖时 <a> 仍可能触发浏览器原生的链接拖拽，那种不归我们管
  if (props.drag === undefined) return
  dragging.value = true
  props.drag.onStart(event)
}

function onDragEnd(): void {
  dragging.value = false
  props.drag?.onEnd()
}

// ↑↓ 选到视口外的卡片时要把它滚出来，否则用户看不到回车会打开哪条
watch(
  () => props.active,
  (active) => {
    if (active) card.value?.scrollIntoView({ block: 'nearest' })
  },
)

/** 图标文件可能已被清掉，加载失败就退回色块，不显示裂图 */
const iconFailed = ref(false)

const showIcon = computed(() => props.bookmark.hasIcon && !iconFailed.value)

/**
 * 带 updatedAt 作缓存键：图标文件路径固定，靠这个参数让换图标后能立刻取到新图，
 * 服务端也就能对图标用长期不可变缓存。
 */
const iconSrc = computed(() => `/icons/${props.bookmark.id}.webp?v=${props.bookmark.updatedAt}`)

const titleParts = computed(() => splitByHighlights(props.bookmark.title, props.highlight ?? []))

/** 和别的书签同名时，标题下多一行主机名来区分；不重名就不显示 */
const host = computed(() =>
  data.duplicateTitleKeys.has(titleKey(props.bookmark.title)) ? displayHost(props.bookmark.url) : null,
)

const menuOpen = computed(() => openMenuId.value === props.bookmark.id)
const moreButton = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)

/** 菜单离视口边缘至少留这么多 */
const MENU_MARGIN = 8
/** 按钮下方不够这么高就改为向上展开 */
const MENU_MIN_BELOW = 240

/**
 * fixed 定位相对视口，直接存最终坐标。
 * 向下展开用 top，向上展开用 bottom；max-height 按那一侧的剩余空间算，
 * 分组多时菜单在内部滚动，不会伸出视口。
 */
const anchor = ref<{ top?: number; bottom?: number; right: number; maxHeight: number }>({
  right: 0,
  maxHeight: 0,
})

const menuStyle = computed(() => ({
  top: anchor.value.top === undefined ? undefined : `${anchor.value.top}px`,
  bottom: anchor.value.bottom === undefined ? undefined : `${anchor.value.bottom}px`,
  right: `${anchor.value.right}px`,
  maxHeight: `${anchor.value.maxHeight}px`,
}))

/**
 * 菜单必须 Teleport 到 body。
 * 启动器面板用了 backdrop-filter，因而是一个独立的层叠上下文，
 * 还会成为 fixed 定位后代的包含块——菜单留在卡片里时，
 * z-index 只在面板内部比较，位置也会被面板的 overflow: hidden 裁掉。
 */
function openMenu(event?: MouseEvent): void {
  event?.preventDefault()
  event?.stopPropagation()

  const rect = moreButton.value?.getBoundingClientRect()
  if (rect === undefined) return

  const right = Math.max(MENU_MARGIN, window.innerWidth - rect.right)
  const below = window.innerHeight - rect.bottom - 6 - MENU_MARGIN
  const above = rect.top - 6 - MENU_MARGIN
  // 下方不够才考虑翻上去，而且上方得更宽裕：两边都挤时翻过去反而更糟
  anchor.value =
    below < MENU_MIN_BELOW && above > below
      ? { bottom: window.innerHeight - rect.top + 6, right, maxHeight: above }
      : { top: rect.bottom + 6, right, maxHeight: below }
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

/** 菜单自己内部的滚动（分组多时）不算，那是用户在菜单里找分组 */
function onScroll(event: Event): void {
  if (event.target instanceof Node && menu.value?.contains(event.target)) return
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
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('resize', dismiss)
  } else {
    document.removeEventListener('click', dismiss)
    document.removeEventListener('keydown', onKeydown)
    window.removeEventListener('scroll', onScroll, { capture: true })
    window.removeEventListener('resize', dismiss)
  }
})

onBeforeUnmount(() => {
  close()
  document.removeEventListener('click', dismiss)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', onScroll, { capture: true })
  window.removeEventListener('resize', dismiss)
})
</script>

<template>
  <!-- 不能靠 mouseleave 收起：菜单已 Teleport 到 body，指针移向菜单就算离开了卡片 -->
  <div class="card-wrap">
    <!--
      整张卡片就是拖拽源。不可拖时不写 draggable，保留浏览器对链接的默认行为。
      真实拖拽结束后浏览器不会再派发 click，所以拖完不会误打开链接。
    -->
    <a
      ref="card"
      class="card"
      :class="{ 'is-dragging': dragging, 'is-active': active }"
      :href="bookmark.url"
      target="_blank"
      rel="noopener noreferrer"
      :title="bookmark.description ?? bookmark.url"
      :draggable="drag ? 'true' : undefined"
      @dragstart="onDragStart"
      @dragend="onDragEnd"
      @contextmenu="openMenu"
    >
      <!-- 图片默认自己就可拖，从图标上按下时拖走的会是图片而不是卡片 -->
      <img
        v-if="showIcon"
        class="card__icon"
        :src="iconSrc"
        alt=""
        width="32"
        height="32"
        loading="lazy"
        decoding="async"
        draggable="false"
        @error="iconFailed = true"
      />
      <!-- 不传 size：尺寸由下面的 .card__icon 决定，桌面端和窄屏不一样 -->
      <FallbackIcon v-else class="card__icon" :title="bookmark.title" :url="bookmark.url" />

      <span class="card__text">
        <span class="card__title">
          <template v-for="(part, index) in titleParts" :key="index"
            ><mark v-if="part.hit" class="card__hit">{{ part.text }}</mark
            ><template v-else>{{ part.text }}</template
          ></template>
        </span>
        <span v-if="host !== null" class="card__host">{{ host }}</span>
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
    <div v-if="menuOpen" ref="menu" class="card-menu" role="menu" :style="menuStyle">
      <button class="card-menu__item" type="button" role="menuitem" @click="choose(() => emit('edit'))">
        编辑
      </button>

      <template v-if="moveTargets.length > 0">
        <div class="card-menu__sep" role="separator" />
        <!-- 小标题只做说明、不可点；分组直接列在下面，点一下就移过去 -->
        <div class="card-menu__section" role="group" aria-label="移到分组">
          <!-- 拦住冒泡：点到小标题不算「点别处」，菜单不收起 -->
          <p class="card-menu__label" aria-hidden="true" @click.stop>移到分组</p>
          <button
            v-for="group in moveTargets"
            :key="group.id"
            class="card-menu__item card-menu__item--group"
            type="button"
            role="menuitem"
            @click="choose(() => emit('move', group.id))"
          >
            <span v-if="group.icon" class="card-menu__icon" aria-hidden="true">{{ group.icon }}</span>
            <span class="card-menu__name">{{ group.name }}</span>
          </button>
        </div>
      </template>

      <div class="card-menu__sep" role="separator" />
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
  /* 悬停才出现的菜单按钮绝对定位，别占标题的宽度 */
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  /* 加上 1px 边框（选中项描边用）后，外框尺寸与样稿的 5px 6px 一致 */
  padding: 4px 5px;
  border: 1px solid transparent;
  border-radius: var(--r-card);
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease);
}

/* 紧凑列表：平时没有底色，悬停才有 */
.card:hover {
  background: var(--glass-card-hover);
}

.card.is-dragging {
  opacity: 0.45;
}

/* 搜索框 ↑↓ 选中的当前项：边框再加一圈外描边，比悬停更醒目 */
.card.is-active {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

/* 图片和首字色块共用；多一层 .card 压过 FallbackIcon 自身的圆角 */
.card .card__icon {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  object-fit: cover;
  font-size: 11px;
}

/* 标题和主机名上下叠放；主机名只在标题重复时才有 */
.card__text {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
}

/* 单行截断：列表里一行一条 */
.card__title {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-width: 0;
  font-size: 13px;
  line-height: 1.35;
  word-break: break-word;
}

.card__host {
  overflow: hidden;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-3);
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 命中片段标黄：用强调色加下划线，不改变文字颜色以免在暗底上失真 */
.card__hit {
  color: inherit;
  background: none;
  border-bottom: 1.5px solid var(--accent);
  font-weight: 600;
}

/* 悬停才出现，带不透明底盖在标题末尾上方，不给它常驻让出宽度 */
.card__more {
  position: absolute;
  right: 3px;
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  color: var(--text-2);
  background: rgb(34 37 46 / 0.92);
  opacity: 0;
  transition: opacity var(--dur) var(--ease), color var(--dur) var(--ease);
}

.card:hover .card__more,
.card__more[aria-expanded='true'] {
  opacity: 1;
}

.card__more:hover {
  color: var(--text);
}

.card-menu {
  /* 已 Teleport 到 body，用 fixed 定位并按按钮坐标摆放，跳出启动器面板的层叠上下文 */
  position: fixed;
  z-index: 60;
  display: grid;
  align-content: start;
  min-width: 132px;
  max-width: 240px;
  /* 分组多时在菜单内部滚动；max-height 由 openMenu 按视口剩余空间算好写进 style */
  overflow-y: auto;
  overscroll-behavior: contain;
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

.card-menu__section {
  display: grid;
}

.card-menu__item--group {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.card-menu__icon {
  flex: 0 0 auto;
  line-height: 1;
}

.card-menu__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-menu__sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--stroke);
}

.card-menu__label {
  padding: 4px 10px 2px;
  font-size: 11px;
  color: var(--text-3);
}
@media (max-width: 640px) {
  /* 竖排：3 列时卡片只有约 100px 宽，横排会把标题挤没。
     菜单按钮改为浮在右上角，不再参与横向布局。 */
  .card {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 8px;
  }

  .card .card__icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    font-size: 15px;
  }

  /* 竖排时卡片按 flex-start 对齐，文字块要撑满宽度，主机名才会截断而不是撑出卡片 */
  .card__text {
    width: 100%;
  }

  .card__title {
    -webkit-line-clamp: 2;
  }

  /* 靠 hover 显形的按钮在触屏上永远点不到，必须常显 */
  .card__more {
    top: 4px;
    transform: none;
    opacity: 1;
  }
}
</style>
