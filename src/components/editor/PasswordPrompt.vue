<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { ApiCallError } from '@/api/client'
import GlassButton from '@/components/ui/GlassButton.vue'

const ui = useUiStore()
const auth = useAuthStore()

const password = ref('')
const error = ref('')
const submitting = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)

watch(
  () => ui.passwordOpen,
  async (v) => {
    if (v) {
      password.value = ''
      error.value = ''
      await nextTick()
      inputEl.value?.focus()
    }
  },
)

async function submit() {
  if (submitting.value) return
  if (!password.value.trim()) {
    error.value = '请输入密码'
    return
  }
  submitting.value = true
  error.value = ''
  try {
    await auth.verify(password.value)
    ui.editMode = true
    ui.passwordOpen = false
  } catch (e) {
    error.value = e instanceof ApiCallError ? e.message : '验证失败'
  } finally {
    submitting.value = false
  }
}

function close() {
  if (submitting.value) return
  ui.passwordOpen = false
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}
</script>

<template>
  <Transition name="modal">
    <div
      v-if="ui.passwordOpen"
      class="backdrop"
      @click="onBackdropClick"
    >
      <div class="modal glass" role="dialog" aria-modal="true">
        <div class="lock-orb">
          <svg viewBox="0 0 32 32" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="7" y="14" width="18" height="14" rx="3" />
            <path d="M11 14V10a5 5 0 0 1 10 0v4" stroke-linecap="round" />
          </svg>
        </div>
        <h2>进入编辑模式</h2>
        <p>验证后即可添加、编辑、导入项目，token 在浏览器内有效 7 天。</p>

        <form class="form" @submit.prevent="submit">
          <input
            ref="inputEl"
            v-model="password"
            type="password"
            class="input"
            placeholder="编辑密码"
            autocomplete="off"
            :disabled="submitting"
          />
          <p v-if="error" class="err">{{ error }}</p>
          <div class="actions">
            <GlassButton type="button" variant="ghost" :disabled="submitting" @click="close">
              取消
            </GlassButton>
            <GlassButton type="submit" variant="primary" :disabled="submitting">
              {{ submitting ? '验证中…' : '验证' }}
            </GlassButton>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgba(7, 9, 26, 0.65);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: var(--space-4);
}

.modal {
  width: 100%;
  max-width: 420px;
  padding: var(--space-6);
  text-align: center;
  display: grid;
  gap: var(--space-3);
}

.lock-orb {
  margin: 0 auto var(--space-2);
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--aurora-1), var(--aurora-2));
  color: #fff;
  box-shadow: 0 0 32px rgba(192, 132, 252, 0.6);
}

h2 {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 700;
}

p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.form {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.input {
  height: 44px;
  padding: 0 var(--space-4);
  background: var(--surface-glass);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  font-size: 14px;
  text-align: center;
  letter-spacing: 0.1em;
  transition: all 0.2s var(--ease-out-soft);
}
.input:focus {
  border-color: var(--line-accent);
  background: var(--surface-glass-strong);
  box-shadow: 0 0 0 4px rgba(192, 132, 252, 0.18);
}

.err {
  color: #fca5a5;
  font-size: 12.5px;
  margin: 0;
}

.actions {
  display: flex;
  justify-content: center;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s var(--ease-out-soft);
}
.modal-enter-active .modal,
.modal-leave-active .modal {
  transition: transform 0.3s var(--ease-out-soft);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal,
.modal-leave-to .modal {
  transform: translateY(20px) scale(0.96);
}
</style>
