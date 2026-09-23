<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Project } from '@/types'
import { useTilt } from '@/composables/useTilt'
import { useProjectsStore } from '@/stores/projects'
import { useHealthStore } from '@/stores/health'
import { useUiStore } from '@/stores/ui'
import HealthBars from './HealthBars.vue'

const props = defineProps<{
  project: Project
}>()

const cardRef = ref<HTMLElement | null>(null)
useTilt(cardRef, { max: 3, scale: 1.008 })

// 远程图标加载失败时回退到首字母
const iconFailed = ref(false)

// icon 字段是不是 http(s) 图片地址
const iconIsImage = computed(
  () => !!props.project.icon && /^https?:\/\//i.test(props.project.icon),
)

const projects = useProjectsStore()
const health = useHealthStore()
const ui = useUiStore()

const host = computed(() => {
  try {
    return new URL(props.project.url).host
  } catch {
    return props.project.url
  }
})

const initial = computed(() => {
  const n = props.project.name.trim()
  return n.charAt(0).toUpperCase()
})

const accent = computed(() => props.project.accentColor || '#cf4520')

const accentRgb = computed(() => {
  const hex = accent.value.replace('#', '')
  const num = parseInt(
    hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex,
    16,
  )
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`
})

const status = computed(
  () => health.getSummary(props.project.id)?.status ?? 'unknown',
)

function onOpen(e: MouseEvent) {
  if (ui.editMode) {
    e.preventDefault()
    ui.openEdit(props.project.id)
    return
  }
  projects.incrementVisit(props.project.id)
}
</script>

<template>
  <a
    ref="cardRef"
    class="card"
    :class="[`status-${status}`, { pinned: project.pinned, private: project.private }]"
    :href="project.url"
    :target="ui.editMode ? '_self' : '_blank'"
    :rel="ui.editMode ? '' : 'noopener noreferrer'"
    :style="{
      '--accent-c': accent,
      '--accent-rgb': accentRgb,
    } as Record<string, string>"
    @click="onOpen"
  >
    <!-- 四角刻线：控制台取景框 -->
    <span class="corner tl" aria-hidden="true"></span>
    <span class="corner tr" aria-hidden="true"></span>
    <span class="corner bl" aria-hidden="true"></span>
    <span class="corner br" aria-hidden="true"></span>
    <!-- 顶部信号条 -->
    <span class="card-stripe" aria-hidden="true"></span>
    <!-- hover 时跟随光标的微光 -->
    <span class="card-glow" aria-hidden="true"></span>

    <header class="card-head">
      <div class="icon-wrap">
        <template v-if="iconIsImage">
          <img
            v-if="!iconFailed"
            class="icon img"
            :src="project.icon"
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
            @error="iconFailed = true"
          />
          <span v-else class="icon letter">{{ initial }}</span>
        </template>
        <span v-else-if="project.icon" class="icon emoji">{{ project.icon }}</span>
        <span v-else class="icon letter">{{ initial }}</span>
      </div>
      <div class="meta">
        <h3 class="name">
          {{ project.name }}
          <span v-if="project.pinned" class="pin" title="置顶">
            <svg viewBox="0 0 12 12" width="10" height="10" fill="currentColor">
              <path d="M6 1l1.5 3.5L11 5l-2.7 2.4L9 11 6 9.2 3 11l.7-3.6L1 5l3.5-.5z"/>
            </svg>
          </span>
        </h3>
        <span class="host">
          <span class="host-prefix">↗</span>{{ host }}
        </span>
      </div>
      <span class="status-pill" :class="status" :title="status">
        <span class="status-dot"></span>
      </span>
      <span v-if="project.private" class="lock-pill" title="仅管理员可见，未登录访客看不到">
        <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6">
          <rect x="2.5" y="5" width="7" height="5" rx="1" />
          <path d="M4 5V3.5a2 2 0 014 0V5" stroke-linecap="round" />
        </svg>
      </span>
    </header>

    <p v-if="project.description" class="desc">{{ project.description }}</p>
    <p v-else class="desc desc-empty">—</p>

    <HealthBars class="health-block" :project-id="project.id" />

    <footer class="card-foot">
      <span class="cat-pill">
        <span class="cat-dot"></span>
        {{ project.category }}
      </span>
      <div class="foot-right">
        <span v-if="project.visits > 0" class="visits" :title="`访问 ${project.visits} 次`">
          <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M2 7s1.7-4 5-4 5 4 5 4-1.7 4-5 4-5-4-5-4z"/>
            <circle cx="7" cy="7" r="1.6"/>
          </svg>
          {{ project.visits }}
        </span>
        <span v-if="ui.editMode" class="edit-tag">
          <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M2 9.5L3 7l5-5 2 2-5 5L2.5 10z"/>
          </svg>
          编辑
        </span>
      </div>
    </footer>
  </a>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-4) var(--space-3);
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  overflow: hidden;
  isolation: isolate;
  min-height: 196px;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-glass);
  transition:
    transform 0.35s var(--ease-out-soft),
    border-color 0.25s var(--ease-out-soft),
    box-shadow 0.3s var(--ease-out-soft),
    background 0.25s var(--ease-out-soft);
}

/* ---------- 四角裁切标（印刷 crop marks） ---------- */
.corner {
  position: absolute;
  width: 10px;
  height: 10px;
  pointer-events: none;
  z-index: 2;
  opacity: 0.3;
  transition: opacity 0.25s var(--ease-out-soft);
}
.corner::before,
.corner::after {
  content: '';
  position: absolute;
  background: rgba(var(--accent-rgb), 0.85);
}
.corner::before { width: 10px; height: 1px; }
.corner::after  { width: 1px;  height: 10px; }
.corner.tl { top: 7px; left: 7px; }
.corner.tl::before { top: 0; left: 0; }
.corner.tl::after  { top: 0; left: 0; }
.corner.tr { top: 7px; right: 7px; }
.corner.tr::before { top: 0; right: 0; }
.corner.tr::after  { top: 0; right: 0; }
.corner.bl { bottom: 7px; left: 7px; }
.corner.bl::before { bottom: 0; left: 0; }
.corner.bl::after  { bottom: 0; left: 0; }
.corner.br { bottom: 7px; right: 7px; }
.corner.br::before { bottom: 0; right: 0; }
.corner.br::after  { bottom: 0; right: 0; }
.card:hover .corner { opacity: 1; }

/* 顶部信号条（hover 点亮并展开） */
.card-stripe {
  position: absolute;
  top: 0;
  left: 12%;
  right: 12%;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(var(--accent-rgb), 0.7) 30%,
    rgba(var(--accent-rgb), 1) 50%,
    rgba(var(--accent-rgb), 0.7) 70%,
    transparent
  );
  opacity: 0;
  transition: opacity 0.25s var(--ease-out-soft), left 0.4s var(--ease-out-soft), right 0.4s var(--ease-out-soft);
  pointer-events: none;
}

/* hover 时跟随光标的微光 */
.card-glow {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: radial-gradient(
    600px circle at var(--tilt-mx, 50%) var(--tilt-my, 0%),
    rgba(var(--accent-rgb), 0.09) 0%,
    transparent 60%
  );
  opacity: 0;
  transition: opacity 0.3s var(--ease-out-soft);
  z-index: 0;
}

.card:hover {
  border-color: rgba(var(--accent-rgb), 0.4);
  box-shadow:
    0 1px 0 0 rgba(48, 38, 28, 0.03),
    0 6px 14px rgba(48, 38, 28, 0.07),
    0 20px 44px -12px rgba(var(--accent-rgb), 0.18);
}
.card:hover .card-stripe {
  opacity: 1;
  left: 0;
  right: 0;
}
.card:hover .card-glow { opacity: 1; }

.card.pinned {
  border-color: rgba(var(--accent-rgb), 0.32);
}
.card.pinned::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 38px;
  background: linear-gradient(180deg, rgba(var(--accent-rgb), 1), transparent);
  border-radius: 0 0 3px 0;
  pointer-events: none;
}

.card.status-offline {
  opacity: 0.72;
  filter: saturate(0.6);
}
.card.status-offline:hover {
  opacity: 1;
  filter: none;
}

/* ---------- 头部：图标 / 名称 / host / 状态点 ---------- */
.card-head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-3);
  position: relative;
  z-index: 1;
}

.icon-wrap {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
  background: linear-gradient(
    135deg,
    rgba(var(--accent-rgb), 0.12),
    rgba(var(--accent-rgb), 0.03)
  );
  border: 1px solid rgba(var(--accent-rgb), 0.22);
  flex-shrink: 0;
  font-size: 18px;
  overflow: hidden;
  transition: border-color 0.2s var(--ease-out-soft), transform 0.3s var(--ease-spring-bounce);
}
.card:hover .icon-wrap {
  border-color: rgba(var(--accent-rgb), 0.45);
  transform: scale(1.05);
}

.icon.emoji {
  font-size: 20px;
  line-height: 1;
}
.icon.img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}
.icon.letter {
  font-weight: 600;
  font-size: 15px;
  color: rgb(var(--accent-rgb));
  font-family: var(--font-mono);
  letter-spacing: -0.02em;
}

.meta {
  min-width: 0;
}

.name {
  margin: 0;
  font-size: 14.5px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.01em;
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pin {
  flex-shrink: 0;
  color: rgb(var(--accent-rgb));
  display: inline-flex;
  align-items: center;
}

.host {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.host-prefix {
  color: var(--text-subtle);
  font-size: 10px;
}

.status-pill {
  width: 8px;
  height: 8px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--status-unknown);
}
.status-pill.online .status-dot {
  background: var(--status-online);
  box-shadow: 0 0 8px var(--status-online);
}
.status-pill.degraded .status-dot {
  background: var(--status-degraded);
  box-shadow: 0 0 8px var(--status-degraded);
}
.status-pill.offline .status-dot {
  background: var(--status-offline);
  box-shadow: 0 0 8px var(--status-offline);
}

/* 仅管理员可见标识 */
.lock-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  background: rgba(217, 119, 6, 0.1);
  border: 1px solid rgba(217, 119, 6, 0.3);
  color: var(--status-degraded);
  flex-shrink: 0;
  margin-left: 4px;
}
.card.private {
  /* 私有卡左侧多一道色条提示，但不抢戏 */
  background: linear-gradient(
    90deg,
    rgba(217, 119, 6, 0.05) 0%,
    var(--bg-elevated) 10%
  );
}

/* ---------- 描述 ---------- */
.desc {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  position: relative;
  z-index: 1;
}
.desc-empty {
  color: var(--text-subtle);
}

.health-block {
  position: relative;
  z-index: 1;
}

/* ---------- 底部 ---------- */
.card-foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  z-index: 1;
  padding-top: var(--space-2);
  border-top: 1px dashed rgba(48, 38, 28, 0.12);
}

.cat-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.cat-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgb(var(--accent-rgb));
  box-shadow: 0 0 6px rgba(var(--accent-rgb), 0.6);
}

.foot-right {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

.visits {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
}

.edit-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  font-family: var(--font-mono);
  color: rgb(var(--accent-rgb));
  padding: 3px 8px;
  border: 1px solid rgba(var(--accent-rgb), 0.3);
  background: rgba(var(--accent-rgb), 0.07);
  border-radius: var(--radius-full);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 600;
}
</style>
