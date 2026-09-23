<script setup lang="ts">
import { ref, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { ApiCallError } from '@/api/client'
import GlassButton from '@/components/ui/GlassButton.vue'

const emit = defineEmits<{
  (e: 'flash', kind: 'ok' | 'err', msg: string): void
}>()

const settings = useSettingsStore()

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const submitting = ref(false)
const clearing = ref(false)

const canSubmit = computed(
  () =>
    oldPassword.value.length > 0 &&
    newPassword.value.length >= 6 &&
    newPassword.value === confirmPassword.value,
)

async function onSubmit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  try {
    await settings.changePassword(oldPassword.value, newPassword.value)
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    emit('flash', 'ok', '密码已更新，下次登录请用新密码')
  } catch (e) {
    emit(
      'flash',
      'err',
      e instanceof ApiCallError ? e.message : '修改失败',
    )
  } finally {
    submitting.value = false
  }
}

async function onClear() {
  if (clearing.value) return
  if (!settings.hasEnvPassword) {
    emit('flash', 'err', '环境变量未设密码，无法清除自定义密码（清除后会无法登录）')
    return
  }
  if (!window.confirm('清除自定义密码后，系统将回退到环境变量 EDIT_PASSWORD，确认？')) {
    return
  }
  clearing.value = true
  try {
    await settings.clearCustomPassword()
    emit('flash', 'ok', '已清除，回退到环境变量密码')
  } catch (e) {
    emit('flash', 'err', e instanceof ApiCallError ? e.message : '清除失败')
  } finally {
    clearing.value = false
  }
}
</script>

<template>
  <div class="pwd">
    <section class="status">
      <div class="status-row">
        <span class="dot" :class="settings.hasCustomPassword ? 'on' : 'off'"></span>
        <div>
          <div class="status-title">
            {{ settings.hasCustomPassword ? '已使用 KV 自定义密码' : '使用环境变量 EDIT_PASSWORD' }}
          </div>
          <div class="status-sub">
            {{
              settings.hasCustomPassword
                ? '验证时会优先校对 KV 中的哈希密码'
                : '在此处设置新密码后，会写入 KV 并覆盖环境变量'
            }}
          </div>
        </div>
      </div>
      <div v-if="!settings.hasEnvPassword && !settings.hasCustomPassword" class="warn">
        ⚠️ 后端未配置任何编辑密码，登录将被拒绝。请立即设置一个。
      </div>
    </section>

    <form class="form" @submit.prevent="onSubmit">
      <label class="field">
        <span class="label">原密码</span>
        <input
          v-model="oldPassword"
          type="password"
          class="input"
          autocomplete="current-password"
          :placeholder="settings.hasCustomPassword ? '当前 KV 中的密码' : '环境变量 EDIT_PASSWORD'"
        />
      </label>
      <label class="field">
        <span class="label">新密码（至少 6 位）</span>
        <input
          v-model="newPassword"
          type="password"
          class="input"
          autocomplete="new-password"
        />
      </label>
      <label class="field">
        <span class="label">确认新密码</span>
        <input
          v-model="confirmPassword"
          type="password"
          class="input"
          autocomplete="new-password"
        />
        <span v-if="confirmPassword && confirmPassword !== newPassword" class="err-hint">两次输入不一致</span>
      </label>

      <div class="actions">
        <GlassButton
          v-if="settings.hasCustomPassword"
          variant="ghost"
          type="button"
          :disabled="clearing || !settings.hasEnvPassword"
          @click="onClear"
        >
          {{ clearing ? '清除中…' : '清除自定义密码' }}
        </GlassButton>
        <span class="spacer"></span>
        <GlassButton
          variant="primary"
          type="submit"
          :disabled="!canSubmit || submitting"
        >
          {{ submitting ? '保存中…' : settings.hasCustomPassword ? '修改密码' : '设置新密码' }}
        </GlassButton>
      </div>
    </form>
  </div>
</template>

<style scoped>
.pwd {
  display: grid;
  gap: var(--space-4);
}

.status {
  padding: var(--space-3) var(--space-4);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  display: grid;
  gap: var(--space-2);
}

.status-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
}
.dot.on {
  background: var(--aurora-2);
  box-shadow: 0 0 8px var(--aurora-2);
}
.dot.off {
  background: var(--text-muted);
}

.status-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}
.status-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
  line-height: 1.5;
}

.warn {
  margin-top: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: rgba(251, 191, 36, 0.08);
  border: 1px solid rgba(251, 191, 36, 0.3);
  border-radius: var(--radius-md);
  font-size: 12px;
  color: #fbbf24;
}

.form {
  display: grid;
  gap: var(--space-3);
}

.field {
  display: grid;
  gap: 4px;
}
.label {
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.input {
  height: 38px;
  padding: 0 var(--space-3);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-primary);
  transition: border-color 0.15s var(--ease-out-soft), box-shadow 0.15s var(--ease-out-soft);
}
.input:focus {
  outline: none;
  border-color: var(--line-accent);
  background: var(--bg-elevated);
  box-shadow: 0 0 0 3px rgba(207, 69, 32, 0.12);
}

.err-hint {
  font-size: 11.5px;
  color: #fca5a5;
}

.actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
.spacer {
  flex: 1;
}
</style>
