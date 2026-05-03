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
      <div class="brand-orb"></div>
      <div class="brand-text">
        <span class="brand-name">极光导航</span>
        <span class="brand-sub">Aurora Nav</span>
      </div>
    </div>

    <div class="search-wrap">
      <div class="search glass">
        <svg class="search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="9" cy="9" r="6" />
          <path d="M14 14L18 18" stroke-linecap="round" />
        </svg>
        <input
          v-model="ui.searchKeyword"
          class="search-input"
          type="text"
          placeholder="搜索项目..."
          aria-label="搜索项目"
        />
        <button class="kbd-hint" @click="ui.togglePalette(true)">
          <span>{{ cmdKey }}</span>
          <span>K</span>
        </button>
      </div>
    </div>

    <div class="actions">
      <GlassButton :variant="ui.editMode ? 'primary' : 'secondary'" @click="toggleEdit">
        <svg v-if="!ui.editMode" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 17l3.5-1 9-9-2.5-2.5-9 9-1 3.5z" stroke-linejoin="round" />
        </svg>
        <svg v-else viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M5 5l10 10M15 5L5 15" stroke-linecap="round" />
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
  padding: var(--space-4) var(--space-6);
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.8);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.brand-orb {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: conic-gradient(
    from 220deg,
    var(--aurora-1),
    var(--aurora-2),
    var(--aurora-3),
    var(--aurora-4),
    var(--aurora-1)
  );
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.8) inset,
    0 0 24px rgba(255, 51, 102, 0.4);
  animation: brand-spin 8s linear infinite;
  position: relative;
}
.brand-orb::after {
  content: '';
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(4px);
}
@keyframes brand-spin {
  to { transform: rotate(360deg); }
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}
.brand-name {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.01em;
  background: linear-gradient(135deg, var(--aurora-1), var(--aurora-3));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.brand-sub {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  letter-spacing: 0.06em;
  font-weight: 600;
}

.search-wrap {
  max-width: 560px;
  width: 100%;
  justify-self: center;
}

.search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3) 0 var(--space-4);
  height: 44px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02), 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: all 0.3s var(--ease-out-soft);
}

.search:focus-within {
  border-color: rgba(255, 51, 102, 0.4);
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.02),
    0 4px 16px rgba(255, 51, 102, 0.15),
    0 0 0 4px rgba(255, 51, 102, 0.1);
  background: #ffffff;
}

.search-icon {
  width: 18px;
  height: 18px;
  color: var(--aurora-1);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  height: 100%;
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}
.search-input::placeholder { color: var(--text-muted); font-weight: 400; }

.kbd-hint {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 26px;
  padding: 0 var(--space-2);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.06);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  transition: all 0.2s var(--ease-out-soft);
}
.kbd-hint:hover {
  background: rgba(255, 51, 102, 0.1);
  color: var(--aurora-1);
  border-color: rgba(255, 51, 102, 0.2);
}

.actions {
  display: flex;
  gap: var(--space-3);
}

@media (max-width: 720px) {
  .topbar { grid-template-columns: 1fr auto; padding: var(--space-3) var(--space-4); }
  .search-wrap { grid-column: 1 / -1; order: 3; max-width: none; }
  .brand-text { display: none; }
}
</style>
