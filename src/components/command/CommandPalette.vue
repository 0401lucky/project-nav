<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import type { Project } from '@/types'
import { useUiStore } from '@/stores/ui'
import { useProjectsStore } from '@/stores/projects'
import { fuzzyFilter } from '@/composables/useFuzzySearch'

const ui = useUiStore()
const projects = useProjectsStore()

const query = ref('')
const cursor = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)

const results = computed(() => {
  const list = fuzzyFilter<Project>(
    projects.items,
    query.value,
    (p) => `${p.name} ${p.description || ''} ${p.category} ${p.url}`,
  )
  return list.slice(0, 12)
})

watch(
  () => ui.paletteOpen,
  async (open) => {
    if (open) {
      query.value = ''
      cursor.value = 0
      await nextTick()
      inputEl.value?.focus()
    }
  },
)

watch(query, () => (cursor.value = 0))

function close() {
  ui.togglePalette(false)
}

function activate(p: Project) {
  if (ui.editMode) {
    ui.openEdit(p.id)
  } else {
    projects.incrementVisit(p.id)
    window.open(p.url, '_blank', 'noopener,noreferrer')
  }
  close()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    cursor.value = (cursor.value + 1) % Math.max(1, results.value.length)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    cursor.value =
      (cursor.value - 1 + Math.max(1, results.value.length)) %
      Math.max(1, results.value.length)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const target = results.value[cursor.value]?.item
    if (target) activate(target)
  }
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}

function hostOf(p: Project): string {
  try {
    return new URL(p.url).host
  } catch {
    return p.url
  }
}
</script>

<template>
  <Transition name="palette">
    <div v-if="ui.paletteOpen" class="backdrop" @click="onBackdropClick">
      <div class="palette glass">
        <div class="search">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="9" cy="9" r="6" />
            <path d="M14 14L18 18" stroke-linecap="round" />
          </svg>
          <input
            ref="inputEl"
            v-model="query"
            class="input"
            placeholder="搜索项目，回车跳转…"
            @keydown="onKey"
          />
          <span class="kbd">esc</span>
        </div>

        <div class="results" :class="{ empty: results.length === 0 }">
          <button
            v-for="(r, i) in results"
            :key="r.item.id"
            class="row"
            :class="{ active: i === cursor }"
            type="button"
            @mouseenter="cursor = i"
            @click="activate(r.item)"
          >
            <span
              class="row-icon"
              :style="{
                background: `linear-gradient(135deg, ${r.item.accentColor || '#c084fc'}, ${r.item.accentColor || '#c084fc'}77)`,
              }"
            >
              {{ r.item.icon && r.item.icon.length <= 4
                  ? r.item.icon
                  : r.item.name.charAt(0).toUpperCase() }}
            </span>
            <span class="row-meta">
              <span class="row-name">{{ r.item.name }}</span>
              <span class="row-host">{{ hostOf(r.item) }}</span>
            </span>
            <span class="row-cat">{{ r.item.category }}</span>
          </button>
          <div v-if="results.length === 0" class="empty-tip">
            <span>{{ query ? '没有匹配的项目' : '在这里输入快速跳转' }}</span>
          </div>
        </div>

        <div class="foot">
          <span class="hint">
            <kbd>↑</kbd><kbd>↓</kbd> 选择
          </span>
          <span class="hint">
            <kbd>Enter</kbd>
            {{ ui.editMode ? '编辑' : '跳转' }}
          </span>
          <span class="hint count">{{ results.length }} 项</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  align-items: start;
  justify-content: center;
  padding: 12vh var(--space-4) var(--space-4);
  background: rgba(7, 9, 26, 0.55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.palette {
  width: 100%;
  max-width: 580px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-xl);
}

.search {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-4);
  height: 52px;
  border-bottom: 1px solid var(--line);
  color: var(--text-muted);
}
.input {
  flex: 1;
  font-size: 15px;
  color: var(--text-primary);
}
.input::placeholder { color: var(--text-muted); }

.kbd {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--line);
  color: var(--text-muted);
  letter-spacing: 0.05em;
}

.results {
  max-height: 50vh;
  overflow-y: auto;
  padding: var(--space-2);
  display: grid;
  gap: 2px;
}
.results.empty {
  display: grid;
  place-items: center;
  min-height: 100px;
}

.row {
  display: grid;
  grid-template-columns: 36px 1fr auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  text-align: left;
  width: 100%;
  transition: background 0.15s var(--ease-out-soft);
}
.row:hover, .row.active {
  background: rgba(255, 255, 255, 0.06);
}
.row.active {
  background: rgba(192, 132, 252, 0.16);
}

.row-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-weight: 600;
  color: #fff;
  font-size: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.row-meta {
  display: grid;
  gap: 1px;
  min-width: 0;
}
.row-name {
  font-size: 13.5px;
  color: var(--text-primary);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-host {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-cat {
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.06);
}

.empty-tip {
  color: var(--text-muted);
  font-size: 13px;
}

.foot {
  display: flex;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--line);
  font-size: 11px;
  color: var(--text-muted);
}
.hint { display: inline-flex; align-items: center; gap: 4px; }
.hint.count { margin-left: auto; }
.hint kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid var(--line);
}

.palette-enter-active,
.palette-leave-active {
  transition: opacity 0.2s var(--ease-out-soft);
}
.palette-enter-active .palette,
.palette-leave-active .palette {
  transition: transform 0.25s var(--ease-out-soft);
}
.palette-enter-from,
.palette-leave-to { opacity: 0; }
.palette-enter-from .palette,
.palette-leave-to .palette {
  transform: translateY(-12px) scale(0.97);
}
</style>
