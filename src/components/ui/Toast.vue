<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { items, dismiss } = useToast()
</script>

<template>
  <!-- 提示是瞬时信息，用 status 而不是 alert，别打断读屏 -->
  <div class="toasts" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <button
        v-for="item in items"
        :key="item.id"
        class="toast"
        :class="{ 'is-error': item.tone === 'error' }"
        type="button"
        @click="dismiss(item.id)"
      >
        {{ item.message }}
      </button>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  left: 50%;
  bottom: 24px;
  z-index: 40;
  display: grid;
  gap: 8px;
  justify-items: center;
  transform: translateX(-50%);
  pointer-events: none;
}

.toast {
  /* 弹出面板：允许用 backdrop-filter 的三类容器之一 */
  padding: 9px 16px;
  font-size: 13px;
  color: var(--text);
  background: var(--glass-sheet);
  border: 1px solid var(--stroke);
  border-radius: var(--r-pill);
  backdrop-filter: blur(var(--blur-panel));
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.4);
  pointer-events: auto;
}

.toast.is-error {
  color: rgb(255 200 200);
  border-color: rgb(220 90 90 / 0.5);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity var(--dur) var(--ease), transform var(--dur) var(--ease);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
