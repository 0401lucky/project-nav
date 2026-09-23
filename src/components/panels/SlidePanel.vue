<script setup lang="ts">
import { ref, watch } from 'vue'
import IconButton from '@/components/ui/IconButton.vue'

const props = defineProps<{
  open: boolean
  title: string
}>()

const emit = defineEmits<{ close: [] }>()

const panel = ref<HTMLElement | null>(null)

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Tab 在面板内循环，不让焦点跑到底下的页面上 */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Tab' || panel.value === null) return

  const focusable = [...panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)]
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (first === undefined || last === undefined) return

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

// 打开后把焦点送进面板，键盘用户不用先 Tab 一遍
watch(
  () => props.open,
  (open) => {
    if (!open) return
    requestAnimationFrame(() => {
      panel.value?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    })
  },
)
</script>

<template>
  <Transition name="sheet">
    <div v-if="open" class="sheet-root" @keydown="onKeydown">
      <div class="sheet__backdrop" @click="emit('close')" />

      <aside
        ref="panel"
        class="sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <header class="sheet__head">
          <h2 class="sheet__title">{{ title }}</h2>
          <IconButton label="关闭" @click="emit('close')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </IconButton>
        </header>

        <div class="sheet__body">
          <slot />
        </div>

        <footer v-if="$slots.footer" class="sheet__foot">
          <slot name="footer" />
        </footer>
      </aside>
    </div>
  </Transition>
</template>

<style scoped>
.sheet-root {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: flex;
  justify-content: flex-end;
}

.sheet__backdrop {
  position: absolute;
  inset: 0;
  background: rgb(0 0 0 / 0.42);
}

/* 弹出面板：允许用 backdrop-filter 的三类容器之一 */
.sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(420px, 100%);
  height: 100%;
  background: rgb(22 26 34 / 0.72);
  border-left: 1px solid var(--stroke);
  backdrop-filter: blur(var(--blur-sheet));
  box-shadow: -24px 0 60px rgb(0 0 0 / 0.45);
}

.sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 12px;
  flex: 0 0 auto;
}

.sheet__title {
  font-size: 15px;
  font-weight: 600;
}

.sheet__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 16px 16px;
}

.sheet__foot {
  flex: 0 0 auto;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--stroke);
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity var(--dur) var(--ease);
}

.sheet-enter-active .sheet,
.sheet-leave-active .sheet {
  transition: transform var(--dur) var(--ease);
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .sheet,
.sheet-leave-to .sheet {
  transform: translateX(100%);
}

@media (max-width: 640px) {
  /* 移动端面板全屏 */
  .sheet {
    width: 100%;
    border-left: none;
  }
}
</style>
