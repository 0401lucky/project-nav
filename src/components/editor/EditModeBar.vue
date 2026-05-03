<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import GlassButton from '@/components/ui/GlassButton.vue'

const ui = useUiStore()
const auth = useAuthStore()

function logout() {
  auth.clear()
  ui.editMode = false
}
</script>

<template>
  <Transition name="bar">
    <div v-if="ui.editMode" class="edit-bar">
      <div class="bar-inner glass">
        <span class="status-dot"></span>
        <span class="label">编辑模式 · 卡片点击切换为编辑</span>
        <div class="bar-actions">
          <GlassButton variant="primary" size="sm" @click="ui.openAdd()">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4">
              <path d="M8 3v10M3 8h10" stroke-linecap="round" />
            </svg>
            添加
          </GlassButton>
          <GlassButton size="sm" @click="ui.screenshotOpen = true">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6">
              <rect x="2" y="3" width="12" height="10" rx="2" />
              <circle cx="8" cy="8" r="2.5" />
              <circle cx="11.5" cy="5.5" r="0.5" fill="currentColor" />
            </svg>
            截图导入
          </GlassButton>
          <GlassButton size="sm" variant="ghost" @click="logout">
            注销
          </GlassButton>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.edit-bar {
  position: fixed;
  bottom: var(--space-5);
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  width: min(720px, calc(100% - var(--space-6) * 2));
}

.bar-inner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3) var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  border-color: rgba(34, 211, 238, 0.4);
  box-shadow:
    var(--shadow-glass),
    0 0 30px rgba(34, 211, 238, 0.2);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--aurora-2);
  box-shadow: 0 0 12px var(--aurora-2);
  animation: pulse 1.6s var(--ease-out-soft) infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.7; }
  50%      { transform: scale(1.3); opacity: 1; }
}

.label {
  flex: 1;
  font-size: 13px;
  color: var(--text-secondary);
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}

.bar-enter-active,
.bar-leave-active {
  transition: all 0.35s var(--ease-out-soft);
}
.bar-enter-from,
.bar-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

@media (max-width: 600px) {
  .label { display: none; }
  .bar-inner { padding: var(--space-2) var(--space-3); }
}
</style>
