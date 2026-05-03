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
useTilt(cardRef, { max: 6, scale: 1.015 })

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

const accent = computed(() => props.project.accentColor || '#c084fc')

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
    class="card glass hoverable"
    :class="[`status-${status}`]"
    :href="project.url"
    :target="ui.editMode ? '_self' : '_blank'"
    :rel="ui.editMode ? '' : 'noopener noreferrer'"
    :style="{
      '--accent': accent,
      '--accent-rgb': accentRgb,
    } as Record<string, string>"
    @click="onOpen"
  >
    <div class="shine"></div>

    <div class="card-head">
      <div class="icon-wrap">
        <span v-if="project.icon && project.icon.length <= 4" class="icon emoji">{{ project.icon }}</span>
        <img v-else-if="project.icon" class="icon img" :src="project.icon" alt="" />
        <span v-else class="icon letter">{{ initial }}</span>
      </div>
      <div class="meta">
        <h3 class="name">
          {{ project.name }}
          <span v-if="project.pinned" class="pin" title="置顶">★</span>
        </h3>
        <span class="host">{{ host }}</span>
      </div>
    </div>

    <p v-if="project.description" class="desc">{{ project.description }}</p>

    <HealthBars class="health" :project-id="project.id" />

    <div class="card-foot">
      <span class="cat-pill">{{ project.category }}</span>
      <div class="foot-right">
        <span v-if="project.visits > 0" class="visits">
          <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M2 8s2-5 6-5 6 5 6 5-2 5-6 5-6-5-6-5z"/>
            <circle cx="8" cy="8" r="2"/>
          </svg>
          {{ project.visits }}
        </span>
        <span v-if="ui.editMode" class="edit-tag">编辑</span>
      </div>
    </div>
  </a>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
  text-decoration: none;
  color: inherit;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  transform-style: preserve-3d;
  isolation: isolate;
  min-height: 200px;
  transition:
    transform 0.4s var(--ease-out-soft),
    border-color 0.4s var(--ease-out-soft),
    box-shadow 0.4s var(--ease-out-soft),
    filter 0.4s var(--ease-out-soft),
    background 0.4s var(--ease-out-soft);
}

.card.status-offline {
  filter: saturate(0.6) opacity(0.8);
  border-color: rgba(239, 68, 68, 0.4);
}
.card.status-offline:hover {
  filter: saturate(1) opacity(1);
}

.card.status-degraded {
  border-color: rgba(245, 158, 11, 0.4);
}

/* 全息反光 / Foil Shine */
.shine {
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  pointer-events: none;
  background: 
    radial-gradient(
      600px circle at var(--tilt-mx, 50%) var(--tilt-my, 50%),
      rgba(255, 255, 255, 0.9) 0%,
      rgba(var(--accent-rgb), 0.5) 20%,
      rgba(0, 242, 254, 0.2) 40%,
      transparent 70%
    ),
    radial-gradient(
      400px circle at calc(100% - var(--tilt-mx, 50%)) calc(100% - var(--tilt-my, 50%)),
      rgba(255, 51, 102, 0.15),
      transparent 60%
    );
  opacity: 0;
  transition: opacity 0.5s var(--ease-out-soft);
  z-index: 0;
  mix-blend-mode: color-dodge;
}

.card:hover .shine { opacity: 1; }

.card:hover {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(var(--accent-rgb), 0.8);
  box-shadow:
    0 1px 0 0 rgba(255, 255, 255, 1) inset,
    0 0 0 1.5px rgba(var(--accent-rgb), 0.4) inset,
    0 30px 60px -10px rgba(var(--accent-rgb), 0.3),
    0 10px 20px -5px rgba(0, 0, 0, 0.05),
    0 0 40px rgba(var(--accent-rgb), 0.2);
}

.card.status-offline:hover {
  border-color: rgba(239, 68, 68, 0.6);
  box-shadow:
    0 1px 0 0 rgba(255, 255, 255, 1) inset,
    0 0 0 1.5px rgba(239, 68, 68, 0.3) inset,
    0 30px 60px -10px rgba(239, 68, 68, 0.25),
    0 0 40px rgba(239, 68, 68, 0.15);
}

.card-head {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: var(--space-3);
  position: relative;
  z-index: 1;
}

.icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-lg);
  display: grid;
  place-items: center;
  background: linear-gradient(
    135deg,
    rgba(var(--accent-rgb), 0.2),
    rgba(var(--accent-rgb), 0.05)
  );
  border: 1px solid rgba(var(--accent-rgb), 0.4);
  flex-shrink: 0;
  font-size: 24px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(var(--accent-rgb), 0.2);
  transition: transform 0.4s var(--ease-spring-bounce);
}

.card:hover .icon-wrap {
  transform: scale(1.1) rotate(5deg);
  background: linear-gradient(
    135deg,
    rgba(var(--accent-rgb), 0.3),
    rgba(var(--accent-rgb), 0.1)
  );
  box-shadow: 0 8px 24px rgba(var(--accent-rgb), 0.3);
}

.icon.emoji { font-size: 26px; line-height: 1; }
.icon.img { width: 32px; height: 32px; object-fit: contain; }
.icon.letter {
  font-weight: 800;
  font-size: 20px;
  color: rgba(var(--accent-rgb), 1);
  font-family: var(--font-mono);
}

.meta {
  min-width: 0;
}

.name {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pin {
  font-size: 14px;
  color: var(--aurora-1); /* Vibrant pink/red for pin */
  flex-shrink: 0;
  filter: drop-shadow(0 2px 4px rgba(255, 51, 102, 0.4));
}

.host {
  display: block;
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.desc {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  position: relative;
  z-index: 1;
}

.health {
  position: relative;
  z-index: 1;
}

.card-foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  z-index: 1;
}

.cat-pill {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  background: rgba(var(--accent-rgb), 0.15);
  color: rgba(var(--accent-rgb), 1);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  box-shadow: inset 0 0 0 1px rgba(var(--accent-rgb), 0.2);
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
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.edit-tag {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--aurora-1);
  padding: 2px 10px;
  border: 1px solid rgba(255, 51, 102, 0.3);
  background: rgba(255, 51, 102, 0.05);
  border-radius: var(--radius-full);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 600;
}
</style>
