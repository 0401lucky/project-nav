<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { items, dismiss } = useToast()

/** 先收起再执行：run 里可能再弹一条提示，顺序反过来会闪一下 */
function runAction(id: number, run: () => void): void {
  dismiss(id)
  run()
}
</script>

<template>
  <!-- 提示是瞬时信息，用 status 而不是 alert，别打断读屏 -->
  <div class="toasts" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <!-- 外层不能再是按钮：按钮里不能套按钮，所以文字和操作各是一个按钮 -->
      <div v-for="item in items" :key="item.id" class="toast" :class="{ 'is-error': item.tone === 'error' }">
        <button class="toast__text" type="button" @click="dismiss(item.id)">
          {{ item.message }}
        </button>
        <button
          v-if="item.action"
          class="toast__action"
          type="button"
          @click="runAction(item.id, item.action.run)"
        >
          {{ item.action.label }}
        </button>
      </div>
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
  display: flex;
  align-items: center;
  gap: 4px;
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

/* 内边距放在文字按钮上：整条的可点区域仍然是「点了就关」 */
.toast__text {
  padding: 9px 16px;
  font-size: inherit;
  color: inherit;
}

.toast__action {
  margin-right: 5px;
  padding: 4px 12px;
  font-size: inherit;
  font-weight: 600;
  color: var(--accent);
  border-radius: var(--r-pill);
  transition: background var(--dur) var(--ease);
}

.toast__action:hover {
  background: rgb(255 255 255 / 0.14);
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
