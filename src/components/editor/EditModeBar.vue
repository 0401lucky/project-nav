<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { useSubmissionsStore } from '@/stores/submissions'

const ui = useUiStore()
const auth = useAuthStore()
const submissions = useSubmissionsStore()

function logout() {
  auth.clear()
  ui.editMode = false
}

// 进入编辑模式时刷新一次投稿数量徽章
async function refreshPending() {
  if (!auth.isAuthed) return
  try {
    await submissions.refreshStats()
  } catch {
    /* ignore */
  }
}

onMounted(refreshPending)
watch(() => ui.editMode, (v) => { if (v) refreshPending() })
</script>

<template>
  <Transition name="bar">
    <div v-if="ui.editMode" class="edit-bar">
      <div class="bar-inner">
        <span class="status-dot"></span>
        <span class="label">编辑模式</span>
        <span class="divider"></span>
        <div class="bar-actions">
          <button class="bar-btn primary" type="button" @click="ui.aiWorkbenchOpen = true" title="AI 工作台">
            <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M7 2v3M7 9v3M2 7h3M9 7h3" stroke-linecap="round"/>
              <circle cx="7" cy="7" r="2"/>
            </svg>
            AI 工作台
          </button>
          <button class="bar-btn" type="button" @click="ui.openAdd()" title="手动添加">
            <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M7 3v8M3 7h8" stroke-linecap="round" />
            </svg>
            添加
          </button>
          <button class="bar-btn" type="button" @click="ui.screenshotOpen = true" title="截图导入">
            <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6">
              <rect x="2" y="3" width="10" height="8" rx="1.5" />
              <circle cx="7" cy="7" r="2" />
            </svg>
            截图
          </button>
          <button class="bar-btn admin-btn" type="button" @click="ui.adminOpen = true" title="后台管理">
            <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6">
              <circle cx="7" cy="7" r="1.8" />
              <path d="M7 1v2M7 11v2M13 7h-2M3 7H1M11 3l-1.4 1.4M4.4 9.6L3 11M11 11l-1.4-1.4M4.4 4.4L3 3" stroke-linecap="round" />
            </svg>
            管理
            <span
              v-if="submissions.stats.pending > 0"
              class="pending-dot"
              :title="`${submissions.stats.pending} 条待审核投稿`"
            >{{ submissions.stats.pending }}</span>
          </button>
          <span class="divider"></span>
          <button class="bar-btn ghost" type="button" @click="logout" title="退出">
            <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M9 4V3a1.5 1.5 0 00-1.5-1.5h-4A1.5 1.5 0 002 3v8a1.5 1.5 0 001.5 1.5h4A1.5 1.5 0 009 11v-1M5 7h8M11 5l2 2-2 2" stroke-linejoin="round" />
            </svg>
            退出
          </button>
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
  width: max-content;
  max-width: calc(100% - var(--space-6) * 2);
}

.bar-inner {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 10px;
  border-radius: var(--radius-full);
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  box-shadow:
    0 1px 0 0 rgba(17, 24, 39, 0.04),
    0 8px 24px -4px rgba(17, 24, 39, 0.12),
    0 0 24px rgba(207, 69, 32, 0.08);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--aurora-2);
  box-shadow: 0 0 10px var(--aurora-2);
  animation: edit-pulse 1.8s var(--ease-out-soft) infinite;
  margin-left: 4px;
}
@keyframes edit-pulse {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1; }
}

.label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.divider {
  width: 1px;
  height: 16px;
  background: var(--line);
}

.bar-actions {
  display: flex;
  gap: 2px;
  align-items: center;
}

.bar-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--radius-full);
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s var(--ease-out-soft);
}
.bar-btn:hover {
  background: var(--bg-sunken);
  color: var(--text-primary);
}

.bar-btn.primary {
  background: linear-gradient(135deg, var(--aurora-1), var(--aurora-3));
  color: #fff;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(207, 69, 32, 0.3);
}
.bar-btn.primary:hover {
  filter: brightness(1.1);
  box-shadow: 0 6px 18px rgba(207, 69, 32, 0.45);
}

.bar-btn.ghost {
  color: var(--text-muted);
}
.bar-btn.ghost:hover {
  color: #fca5a5;
  background: rgba(239, 68, 68, 0.12);
}

/* 后台管理按钮上的待审核计数 */
.admin-btn {
  position: relative;
}
.pending-dot {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: #ef4444;
  color: #fff;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
  font-family: var(--font-mono);
  display: grid;
  place-items: center;
  border: 1.5px solid var(--bg-elevated);
  box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.4), 0 2px 6px rgba(239, 68, 68, 0.4);
  animation: pd-pulse 1.6s var(--ease-out-soft) infinite;
}
@keyframes pd-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.12); }
}

.bar-enter-active,
.bar-leave-active {
  transition: all 0.3s var(--ease-out-soft);
}
.bar-enter-from,
.bar-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(16px);
}

@media (max-width: 640px) {
  .bar-inner {
    padding: 5px 6px;
    gap: 4px;
  }
  .label, .divider:first-of-type { display: none; }
  .bar-btn { padding: 0 8px; }
}
</style>
