<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const password = ref('')
const input = ref<HTMLInputElement | null>(null)

const canSubmit = computed(() => password.value !== '' && !auth.pending)

async function submit(): Promise<void> {
  if (!canSubmit.value) return
  const ok = await auth.login(password.value)
  // 不管成败都清空输入框：失败时也让用户重新输，不留下可能错的密码
  password.value = ''
  if (ok) return
  input.value?.focus()
}

onMounted(() => input.value?.focus())
</script>

<template>
  <div class="login">
    <form class="login__box" @submit.prevent="submit">
      <h1 class="login__title">书签</h1>
      <p class="login__hint">{{ auth.locked ? '尝试次数过多' : '输入密码进入' }}</p>

      <!--
        给密码管理器一个可关联的用户名。本站只有一个密码，值固定且不可编辑，
        所以不给焦点、对读屏隐藏，纯粹是为了让凭据能正确保存。
      -->
      <input
        class="sr-only"
        type="text"
        name="username"
        autocomplete="username"
        value="bookmark-nav"
        readonly
        tabindex="-1"
        aria-hidden="true"
      />

      <input
        ref="input"
        v-model="password"
        class="login__input"
        type="password"
        autocomplete="current-password"
        :placeholder="auth.locked ? '请稍后再试' : '密码'"
        :disabled="auth.pending"
        aria-label="密码"
      />

      <p v-if="auth.error" class="login__error" role="alert">{{ auth.error }}</p>

      <button class="login__submit" type="submit" :disabled="!canSubmit">
        {{ auth.pending ? '验证中…' : '进入' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.login {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  /* 作为 App 的 flex 子项撑满剩余高度 */
  flex: 1 1 auto;
  min-height: 0;
  padding: var(--page-x);
}

/* 弹出面板：允许用 backdrop-filter 的三类容器之一 */
.login__box {
  display: grid;
  gap: 12px;
  width: min(320px, 100%);
  padding: 28px 24px 24px;
  background: var(--glass-sheet);
  border: 1px solid var(--stroke);
  border-radius: var(--r-panel);
  backdrop-filter: blur(var(--blur-sheet));
  box-shadow: 0 24px 60px rgb(0 0 0 / 0.45);
}

.login__title {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-align: center;
  color: var(--text);
}

.login__hint {
  margin-top: -6px;
  font-size: 13px;
  text-align: center;
  color: var(--text-3);
}

.login__input {
  width: 100%;
  padding: 11px 14px;
  margin-top: 4px;
  background: rgb(0 0 0 / 0.28);
  border: 1px solid var(--stroke);
  border-radius: 12px;
  color: var(--text);
  outline: none;
  transition: border-color var(--dur) var(--ease);
}

.login__input::placeholder {
  color: var(--text-3);
}

.login__input:focus {
  border-color: var(--accent);
}

.login__input:disabled {
  opacity: 0.5;
}

.login__error {
  font-size: 13px;
  color: rgb(255 170 170);
}

.login__submit {
  padding: 11px 14px;
  font-weight: 600;
  color: #10131a;
  background: var(--accent);
  border-radius: 12px;
  transition: filter var(--dur) var(--ease);
}

.login__submit:hover:not(:disabled) {
  filter: brightness(1.08);
}

.login__submit:disabled {
  cursor: default;
  opacity: 0.45;
}
</style>
