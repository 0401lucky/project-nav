<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import GlassButton from '@/components/ui/GlassButton.vue'

const ui = useUiStore()
const auth = useAuthStore()

const isMac = computed(() =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
)
const cmdKey = computed(() => (isMac.value ? '⌘' : 'Ctrl'))

function toggleEdit() {
  if (ui.editMode) {
    ui.editMode = false
    return
  }
  if (auth.isAuthed) ui.editMode = true
  else ui.passwordOpen = true
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round">
          <path d="M10 2v16M2 10h16M4.3 4.3l11.4 11.4M15.7 4.3L4.3 15.7" />
        </svg>
      </div>
      <div class="brand-text">
        <span class="brand-name">Aurora Nav</span>
        <span class="brand-sub">项目索引</span>
      </div>
    </div>

    <div class="search-wrap">
      <div class="search">
        <svg class="search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
          <circle cx="7" cy="7" r="5" />
          <path d="M11 11l3 3" stroke-linecap="round" />
        </svg>
        <input
          v-model="ui.searchKeyword"
          class="search-input"
          type="text"
          placeholder="搜索项目…"
          aria-label="搜索项目"
        />
        <button class="kbd-hint" type="button" @click="ui.togglePalette(true)">
          <span>{{ cmdKey }}</span><span>K</span>
        </button>
      </div>
    </div>

    <div class="actions">
      <button
        class="submit-btn"
        type="button"
        title="推荐项目（投稿）"
        @click="ui.submitOpen = true"
      >
        <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.7">
          <path d="M7 2v9M4 7l3-5 3 5M3 13h8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        投稿
      </button>
      <GlassButton :variant="ui.editMode ? 'primary' : 'secondary'" size="sm" @click="toggleEdit">
        <svg v-if="!ui.editMode" viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M2 12l2.5-.7 6.5-6.5L9.2 3 2.7 9.5 2 12z" stroke-linejoin="round" />
        </svg>
        <svg v-else viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 3l8 8M11 3l-8 8" stroke-linecap="round" />
        </svg>
        <span>{{ ui.editMode ? '退出编辑' : '编辑模式' }}</span>
      </GlassButton>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-5);
  padding: 12px var(--space-5);
  background: rgba(247, 243, 236, 0.85);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--line);
}

/* 刊头压边：顶栏上沿一道朱红细带 */
.topbar::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(
    90deg,
    var(--aurora-3),
    var(--aurora-1) 40%,
    #e8703f 60%,
    var(--aurora-1)
  );
  pointer-events: none;
}

/* ---------- Brand：朱红印章标 + 衬线刊名 ---------- */
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-mark {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  background: linear-gradient(160deg, #e0592e, var(--aurora-3));
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.25) inset,
    0 3px 8px rgba(207, 69, 32, 0.3);
}

.brand-text {
  display: flex;
  align-items: baseline;
  gap: 8px;
  line-height: 1;
}
.brand-name {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.005em;
}
.brand-sub {
  font-size: 10.5px;
  color: var(--text-muted);
  letter-spacing: 0.3em;
  font-weight: 500;
  padding-left: 8px;
  border-left: 1px solid var(--line-strong);
}

/* ---------- 搜索框 ---------- */
.search-wrap {
  max-width: 520px;
  width: 100%;
  justify-self: center;
}

.search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 6px 0 var(--space-3);
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  box-shadow: 0 1px 2px rgba(48, 38, 28, 0.04);
  transition: border-color 0.2s var(--ease-out-soft), box-shadow 0.2s var(--ease-out-soft);
}

.search:focus-within {
  border-color: var(--line-accent);
  box-shadow: 0 0 0 3px rgba(207, 69, 32, 0.1);
}

.search-icon {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  height: 100%;
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 400;
}
.search-input::placeholder {
  color: var(--text-subtle);
  font-weight: 400;
}

.kbd-hint {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 22px;
  padding: 0 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  transition: all 0.15s var(--ease-out-soft);
}
.kbd-hint:hover {
  color: var(--accent);
  border-color: var(--line-accent);
}

.actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.submit-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  background: transparent;
  border: 1px solid var(--line);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s var(--ease-out-soft);
}
.submit-btn:hover {
  color: var(--accent);
  border-color: var(--line-accent);
  background: rgba(207, 69, 32, 0.05);
}

@media (max-width: 720px) {
  .topbar {
    grid-template-columns: 1fr auto;
    padding: 10px var(--space-4);
    gap: var(--space-3);
  }
  .search-wrap {
    grid-column: 1 / -1;
    order: 3;
    max-width: none;
  }
  .brand-sub { display: none; }
}
</style>
