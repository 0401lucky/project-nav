<script setup lang="ts">
// 嵌入模式专用浮动胶囊：底部居中，避开宿主页面顶栏（如 NewAPI 顶部菜单）
// 仅在「嵌入模式 + 未进入编辑模式」时渲染，避免与 EditModeBar 重叠
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'

const ui = useUiStore()
const auth = useAuthStore()

const isMac = computed(() =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent),
)
const cmdLabel = computed(() => (isMac.value ? '⌘K' : 'Ctrl K'))

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
  <div class="embed-bar">
    <button
      class="action search"
      type="button"
      :title="`命令面板搜索 (${cmdLabel})`"
      @click="ui.togglePalette(true)"
    >
      <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6">
        <circle cx="6" cy="6" r="4" />
        <path d="M9 9l3.5 3.5" stroke-linecap="round" />
      </svg>
      <span class="action-label">搜索</span>
      <span class="kbd">{{ cmdLabel }}</span>
    </button>

    <span class="divider"></span>

    <button
      class="action"
      type="button"
      title="推荐项目（投稿）"
      @click="ui.submitOpen = true"
    >
      <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.7">
        <path d="M7 2v9M4 7l3-5 3 5M3 13h8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="action-label">投稿</span>
    </button>

    <button
      class="action edit"
      type="button"
      title="编辑模式（需密码）"
      @click="toggleEdit"
    >
      <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8">
        <path d="M2 12l2.5-.7 6.5-6.5L9.2 3 2.7 9.5 2 12z" stroke-linejoin="round" />
      </svg>
      <span class="action-label">编辑</span>
    </button>
  </div>
</template>

<style scoped>
.embed-bar {
  position: fixed;
  bottom: var(--space-5);
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 6px;
  border-radius: var(--radius-full);
  border: 1px solid var(--line);
  box-shadow:
    0 1px 0 0 rgba(255, 255, 255, 0.6) inset,
    0 12px 36px -4px rgba(48, 38, 28, 0.18),
    0 0 0 1px rgba(207, 69, 32, 0.06);
  /* 半透明玻璃感，让宿主页面隐约透出来，不显得突兀 */
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
  background: rgba(255, 253, 249, 0.92);
}

.action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s var(--ease-out-soft);
  white-space: nowrap;
}
.action:hover {
  background: var(--bg-sunken);
  color: var(--text-primary);
}
.action svg {
  flex-shrink: 0;
}

.action.search {
  padding: 0 6px 0 10px;
}

.action.edit {
  background: linear-gradient(135deg, var(--aurora-1), var(--aurora-3));
  color: #fff;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(207, 69, 32, 0.25);
}
.action.edit:hover {
  filter: brightness(1.1);
  background: linear-gradient(135deg, var(--aurora-1), var(--aurora-3));
}

.action-label {
  letter-spacing: 0.01em;
}

.kbd {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}

.divider {
  width: 1px;
  height: 16px;
  background: var(--line);
  margin: 0 2px;
}

@media (max-width: 480px) {
  .embed-bar { gap: 2px; padding: 4px; }
  .action { padding: 0 8px; }
  .action-label { display: none; }
  .kbd { display: none; }
  .divider { display: none; }
}
</style>
