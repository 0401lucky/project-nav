<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useProjectsStore } from '@/stores/projects'
import { useSubmissionsStore } from '@/stores/submissions'
import { ApiCallError } from '@/api/client'
import GlassButton from '@/components/ui/GlassButton.vue'

const ui = useUiStore()
const projects = useProjectsStore()
const submissions = useSubmissionsStore()

const PRESET_COLORS = [
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#10b981',
  '#6366f1',
  '#f59e0b',
  '#ef4444',
  '#fb923c',
]

const name = ref('')
const url = ref('')
const description = ref('')
const category = ref('')
const contact = ref('')
const reason = ref('')
const accentColor = ref<string>(PRESET_COLORS[0])
const website = ref('') // 蜜罐字段

const submitting = ref(false)
const error = ref('')
const successId = ref<string | null>(null)
const nameEl = ref<HTMLInputElement | null>(null)

const canSubmit = computed(
  () =>
    name.value.trim().length > 0 &&
    url.value.trim().length > 0 &&
    !submitting.value,
)

watch(
  () => ui.submitOpen,
  async (open) => {
    if (open) {
      name.value = ''
      url.value = ''
      description.value = ''
      category.value = ''
      contact.value = ''
      reason.value = ''
      accentColor.value = PRESET_COLORS[0]
      website.value = ''
      error.value = ''
      successId.value = null
      await nextTick()
      nameEl.value?.focus()
    }
  },
)

async function submit() {
  if (!canSubmit.value) return
  const u = url.value.trim()
  if (!/^https?:\/\//i.test(u) && !u.includes('.')) {
    error.value = 'URL 不合法，请输入完整网址'
    return
  }
  submitting.value = true
  error.value = ''
  try {
    const resp = await submissions.submitPublic({
      name: name.value.trim(),
      url: u,
      description: description.value.trim() || undefined,
      category: category.value.trim() || undefined,
      contact: contact.value.trim() || undefined,
      reason: reason.value.trim() || undefined,
      accentColor: accentColor.value,
      website: website.value, // 蜜罐
    })
    successId.value = resp.id
  } catch (e) {
    if (e instanceof ApiCallError) {
      error.value =
        e.message + (e.payload.detail ? '：' + e.payload.detail : '')
    } else {
      error.value = '提交失败'
    }
  } finally {
    submitting.value = false
  }
}

function close() {
  if (submitting.value) return
  ui.submitOpen = false
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}

function reset() {
  successId.value = null
  name.value = ''
  url.value = ''
  description.value = ''
  category.value = ''
  contact.value = ''
  reason.value = ''
  accentColor.value = PRESET_COLORS[0]
}
</script>

<template>
  <Transition name="modal">
    <div v-if="ui.submitOpen" class="backdrop" @click="onBackdropClick">
      <div class="modal" role="dialog" aria-modal="true">
        <header class="head">
          <div class="title-block">
            <div class="head-icon">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M8 2v9M4 7l4-5 4 5M3 13h10" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <div>
              <h2>推荐项目</h2>
              <p class="subtitle">提交后等管理员审核，通过后会出现在导航站</p>
            </div>
          </div>
          <button type="button" class="close" aria-label="关闭" @click="close">
            <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3l8 8M11 3l-8 8" stroke-linecap="round" />
            </svg>
          </button>
        </header>

        <!-- 提交成功后的状态 -->
        <div v-if="successId" class="success">
          <div class="success-orb">
            <svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 8.5L7 12.5 13 4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
          <h3>已提交</h3>
          <p>感谢推荐！管理员审核通过后会展示在导航站。</p>
          <p class="success-id">编号：<code>{{ successId }}</code></p>
          <div class="success-actions">
            <GlassButton variant="ghost" @click="close">关闭</GlassButton>
            <GlassButton variant="primary" @click="reset">再推荐一个</GlassButton>
          </div>
        </div>

        <!-- 表单 -->
        <form v-else class="body" @submit.prevent="submit">
          <!-- 蜜罐：人不可见，机器人会自动填 -->
          <div class="honeypot" aria-hidden="true">
            <label>
              请勿填写
              <input
                v-model="website"
                type="text"
                tabindex="-1"
                autocomplete="off"
              />
            </label>
          </div>

          <div class="row">
            <label class="field grow">
              <span class="label">项目名 <em>*</em></span>
              <input
                ref="nameEl"
                v-model="name"
                class="input"
                placeholder="例如 Aurora Chat"
                maxlength="80"
                required
              />
            </label>
            <label class="field">
              <span class="label">分类</span>
              <input
                v-model="category"
                class="input"
                placeholder="工具 / AI / 部署 ..."
                list="submit-cat-list"
                maxlength="24"
              />
              <datalist id="submit-cat-list">
                <option v-for="c in projects.categories" :key="c" :value="c" />
              </datalist>
            </label>
          </div>

          <label class="field">
            <span class="label">URL <em>*</em></span>
            <input
              v-model="url"
              class="input"
              type="url"
              placeholder="https://example.com"
              maxlength="500"
              required
            />
            <span class="hint">提交后系统会自动尝试抓取该网站的 logo</span>
          </label>

          <label class="field">
            <span class="label">一句话描述</span>
            <textarea
              v-model="description"
              class="input textarea"
              rows="2"
              placeholder="这个站点是干什么的（不超过 100 字）"
              maxlength="300"
            />
          </label>

          <label class="field">
            <span class="label">推荐理由（可选）</span>
            <textarea
              v-model="reason"
              class="input textarea"
              rows="2"
              placeholder="给管理员看：你为什么推荐它？"
              maxlength="500"
            />
          </label>

          <label class="field">
            <span class="label">联系方式（可选）</span>
            <input
              v-model="contact"
              class="input"
              placeholder="邮箱 / Telegram / 微信，方便管理员联系反馈"
              maxlength="120"
            />
          </label>

          <div class="field">
            <span class="label">建议主色调（可选）</span>
            <div class="colors">
              <button
                v-for="c in PRESET_COLORS"
                :key="c"
                type="button"
                class="color-dot"
                :class="{ on: accentColor === c }"
                :style="{ background: c }"
                :title="c"
                @click="accentColor = c"
              ></button>
            </div>
          </div>

          <p v-if="error" class="err">{{ error }}</p>

          <footer class="foot">
            <span class="foot-tip">投稿不需要登录</span>
            <div class="foot-right">
              <GlassButton
                type="button"
                variant="ghost"
                :disabled="submitting"
                @click="close"
              >
                取消
              </GlassButton>
              <GlassButton
                type="submit"
                variant="primary"
                :disabled="!canSubmit"
              >
                {{ submitting ? '提交中…' : '提交' }}
              </GlassButton>
            </div>
          </footer>
        </form>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 92;
  display: grid;
  place-items: center;
  background: rgba(30, 25, 20, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: var(--space-4);
}

.modal {
  width: 100%;
  max-width: 540px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-elevated);
  overflow: hidden;
  position: relative;
}
.modal::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--aurora-1) 30%,
    var(--aurora-2) 70%,
    transparent
  );
  opacity: 0.7;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
}
.title-block {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.head-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--aurora-1), var(--aurora-3));
  color: #fff;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}
.subtitle {
  margin: 2px 0 0;
  font-size: 11.5px;
  color: var(--text-muted);
}
.close {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  border: 1px solid transparent;
  transition: all 0.15s var(--ease-out-soft);
}
.close:hover {
  color: var(--text-primary);
  background: var(--bg-sunken);
  border-color: var(--line);
}

/* ---------- 表单 ---------- */
.body {
  padding: 0 var(--space-5) var(--space-4);
  display: grid;
  gap: var(--space-3);
  overflow-y: auto;
}

.honeypot {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
  pointer-events: none;
}

.field {
  display: grid;
  gap: 5px;
}
.field.grow { flex: 1; }
.row {
  display: grid;
  grid-template-columns: 1fr 200px;
  gap: var(--space-3);
}
@media (max-width: 540px) {
  .row { grid-template-columns: 1fr; }
}

.label {
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 600;
}
.label em {
  color: var(--aurora-1);
  font-style: normal;
  margin-left: 2px;
}

.input {
  height: 38px;
  padding: 0 var(--space-3);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13px;
  width: 100%;
  transition: all 0.15s var(--ease-out-soft);
}
.input:focus {
  outline: none;
  border-color: var(--line-accent);
  background: var(--bg-elevated);
  box-shadow: 0 0 0 3px rgba(207, 69, 32, 0.12);
}
.textarea {
  height: auto;
  padding: 8px var(--space-3);
  font-family: var(--font-sans);
  resize: vertical;
  min-height: 56px;
  line-height: 1.5;
}

.hint {
  font-size: 10.5px;
  color: var(--text-muted);
}

.colors {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.color-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid transparent;
  transition: all 0.15s var(--ease-out-soft);
  cursor: pointer;
}
.color-dot:hover {
  transform: scale(1.1);
}
.color-dot.on {
  border-color: var(--text-primary);
  box-shadow: 0 0 0 2px var(--bg-elevated), 0 0 0 4px currentColor;
}

.err {
  margin: 0;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  font-size: 12px;
  border-radius: var(--radius-md);
}

.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--line);
  margin-top: var(--space-2);
}
.foot-tip {
  font-size: 11.5px;
  color: var(--text-muted);
}
.foot-right {
  display: flex;
  gap: 8px;
}

/* ---------- 成功态 ---------- */
.success {
  padding: var(--space-7) var(--space-5);
  display: grid;
  place-items: center;
  gap: var(--space-3);
  text-align: center;
}
.success-orb {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #10b981;
  display: grid;
  place-items: center;
  margin-bottom: var(--space-2);
}
.success h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
}
.success p {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-muted);
  line-height: 1.6;
}
.success-id {
  font-size: 11px !important;
  font-family: var(--font-mono);
}
.success-id code {
  background: var(--bg-sunken);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--line);
  color: var(--text-secondary);
}
.success-actions {
  margin-top: var(--space-3);
  display: flex;
  gap: 8px;
}

/* ---------- 动画 ---------- */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s var(--ease-out-soft);
}
.modal-enter-active .modal,
.modal-leave-active .modal {
  transition: transform 0.25s var(--ease-out-soft);
}
.modal-enter-from,
.modal-leave-to { opacity: 0; }
.modal-enter-from .modal,
.modal-leave-to .modal {
  transform: translateY(12px) scale(0.97);
}
</style>
