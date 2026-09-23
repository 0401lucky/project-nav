<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { Project } from '@/types'
import { useUiStore } from '@/stores/ui'
import { useProjectsStore } from '@/stores/projects'
import { api, ApiCallError } from '@/api/client'
import { nanoid } from '@/utils/id'
import GlassButton from '@/components/ui/GlassButton.vue'

const ui = useUiStore()
const projects = useProjectsStore()

const PRESET_COLORS = [
  '#8b5cf6', '#06b6d4', '#ec4899', '#10b981',
  '#6366f1', '#f59e0b', '#ef4444', '#fb923c',
]

const draft = ref<Project>(emptyProject())
const error = ref('')
const submitting = ref(false)
const fetchingLogo = ref(false)
const logoCandidates = ref<string[]>([])
const nameEl = ref<HTMLInputElement | null>(null)

const isEdit = computed(
  () => ui.editorTarget?.kind === 'edit',
)

const iconPreview = computed(() => {
  const v = draft.value.icon?.trim() || ''
  if (!v) return null
  if (/^https?:\/\//i.test(v)) return { kind: 'img' as const, src: v }
  return { kind: 'emoji' as const, char: v }
})

function emptyProject(): Project {
  return {
    id: nanoid(8),
    name: '',
    url: '',
    description: '',
    category: '默认',
    icon: '',
    accentColor: PRESET_COLORS[0],
    pinned: false,
    private: false,
    createdAt: Date.now(),
    visits: 0,
  }
}

watch(
  () => ui.editorTarget,
  async (target) => {
    if (!target) return
    if (target.kind === 'add') {
      draft.value = emptyProject()
    } else {
      const found = projects.items.find((p) => p.id === target.projectId)
      draft.value = found ? { ...found } : emptyProject()
    }
    error.value = ''
    logoCandidates.value = []
    await nextTick()
    nameEl.value?.focus()
  },
)

// 调后端抓 favicon 候选
async function fetchLogo() {
  if (fetchingLogo.value) return
  const url = draft.value.url.trim()
  if (!url) {
    error.value = '请先填写 URL'
    return
  }
  fetchingLogo.value = true
  error.value = ''
  try {
    const resp = await api.post<{
      best: string | null
      candidates: string[]
      title?: string
      warning?: string
    }>('/api/admin/favicon', { url }, { auth: true })
    if (resp.best) {
      draft.value.icon = resp.best
      logoCandidates.value = resp.candidates || []
      if (!draft.value.name && resp.title) {
        draft.value.name = resp.title.replace(/[\s\-|·]+.+$/, '').trim()
      }
    } else {
      error.value = resp.warning || '没找到 logo'
    }
  } catch (e) {
    error.value = e instanceof ApiCallError ? e.message : '获取 logo 失败'
  } finally {
    fetchingLogo.value = false
  }
}

function pickLogoCandidate(url: string) {
  draft.value.icon = url
}

async function save() {
  if (submitting.value) return
  const d = draft.value
  if (!d.name.trim()) return (error.value = '名称不能为空')
  if (!d.url.trim()) return (error.value = 'URL 不能为空')
  if (!/^https?:\/\//i.test(d.url)) return (error.value = 'URL 必须以 http:// 或 https:// 开头')
  if (!d.category.trim()) d.category = '默认'

  submitting.value = true
  error.value = ''
  try {
    await projects.addOrUpdate({
      ...d,
      name: d.name.trim(),
      url: d.url.trim(),
      description: d.description?.trim() || undefined,
      category: d.category.trim(),
      icon: d.icon?.trim() || undefined,
    })
    ui.closeEditor()
  } catch (e) {
    error.value = e instanceof ApiCallError ? e.message : '保存失败'
  } finally {
    submitting.value = false
  }
}

async function remove() {
  if (submitting.value) return
  if (!isEdit.value) return
  if (!confirm(`确定删除「${draft.value.name}」？`)) return
  submitting.value = true
  try {
    await projects.remove(draft.value.id)
    ui.closeEditor()
  } catch (e) {
    error.value = e instanceof ApiCallError ? e.message : '删除失败'
  } finally {
    submitting.value = false
  }
}

function close() {
  if (submitting.value) return
  ui.closeEditor()
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}
</script>

<template>
  <Transition name="modal">
    <div
      v-if="ui.editorTarget"
      class="backdrop"
      @click="onBackdropClick"
    >
      <div class="modal" role="dialog" aria-modal="true">
        <header class="head">
          <h2>{{ isEdit ? '编辑项目' : '添加项目' }}</h2>
          <button class="close" aria-label="关闭" @click="close">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3l10 10M13 3L3 13" stroke-linecap="round" />
            </svg>
          </button>
        </header>

        <div class="body">
          <div class="row">
            <label>
              <span>项目名</span>
              <input ref="nameEl" v-model="draft.name" class="input" placeholder="例如：Aurora Chat" />
            </label>
            <label class="icon-field">
              <span>图标</span>
              <div class="icon-row">
                <span v-if="iconPreview" class="icon-preview">
                  <img v-if="iconPreview.kind === 'img'" :src="iconPreview.src" alt="" />
                  <span v-else>{{ iconPreview.char }}</span>
                </span>
                <input v-model="draft.icon" class="input icon-input" placeholder="emoji 或图片 URL" />
              </div>
            </label>
          </div>

          <label>
            <span>URL</span>
            <div class="url-row">
              <input v-model="draft.url" class="input" placeholder="https://your-site.workers.dev" />
              <button
                type="button"
                class="logo-btn"
                :disabled="fetchingLogo || !draft.url.trim()"
                title="抓取该网址的 favicon / og:image 作为图标"
                @click="fetchLogo"
              >
                <svg v-if="!fetchingLogo" viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6">
                  <rect x="2" y="3" width="10" height="8" rx="1.5"/>
                  <circle cx="7" cy="7" r="2"/>
                </svg>
                <svg v-else class="spin" viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M12 7a5 5 0 11-1.5-3.5" stroke-linecap="round"/>
                </svg>
                {{ fetchingLogo ? '抓取中…' : '自动获取 Logo' }}
              </button>
            </div>
            <div v-if="logoCandidates.length > 1" class="logo-candidates">
              <span class="cand-label">候选：</span>
              <button
                v-for="c in logoCandidates"
                :key="c"
                type="button"
                class="cand-img"
                :class="{ on: draft.icon === c }"
                :title="c"
                @click="pickLogoCandidate(c)"
              >
                <img :src="c" alt="" @error="($event.target as HTMLImageElement).style.opacity = '0.2'" />
              </button>
            </div>
          </label>

          <label>
            <span>描述（可选）</span>
            <textarea
              v-model="draft.description"
              class="input textarea"
              placeholder="一两句话描述这个项目，会显示在卡片上"
              rows="2"
            />
          </label>

          <div class="row">
            <label>
              <span>分类</span>
              <input v-model="draft.category" class="input" placeholder="AI / 工具 / 实验 / ..." list="cat-list" />
              <datalist id="cat-list">
                <option v-for="c in projects.categories" :key="c" :value="c" />
              </datalist>
            </label>
            <label class="pin-field">
              <span>置顶</span>
              <button
                type="button"
                class="toggle"
                :class="{ on: draft.pinned }"
                @click="draft.pinned = !draft.pinned"
              >
                <span class="dot"></span>
              </button>
            </label>
          </div>

          <div class="visibility-row" :class="{ active: draft.private }">
            <div class="vis-text">
              <div class="vis-title">
                <svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6">
                  <rect x="3" y="6" width="8" height="6" rx="1.2" />
                  <path d="M5 6V4.5a2 2 0 014 0V6" stroke-linecap="round" />
                </svg>
                仅管理员可见
              </div>
              <div class="vis-sub">
                开启后，未登录访客无法看到这张卡片；登录进入编辑模式才能看到。
              </div>
            </div>
            <button
              type="button"
              class="toggle"
              :class="{ on: draft.private }"
              @click="draft.private = !draft.private"
            >
              <span class="dot"></span>
            </button>
          </div>

          <div class="color-field">
            <span class="label">强调色</span>
            <div class="colors">
              <button
                v-for="c in PRESET_COLORS"
                :key="c"
                type="button"
                class="color-dot"
                :class="{ on: draft.accentColor === c }"
                :style="{ background: c }"
                @click="draft.accentColor = c"
              ></button>
              <input
                v-model="draft.accentColor"
                type="color"
                class="color-picker"
                :title="draft.accentColor"
              />
            </div>
          </div>

          <p v-if="error" class="err">{{ error }}</p>
        </div>

        <footer class="foot">
          <GlassButton
            v-if="isEdit"
            variant="danger"
            :disabled="submitting"
            @click="remove"
          >
            删除
          </GlassButton>
          <div class="foot-right">
            <GlassButton variant="ghost" :disabled="submitting" @click="close">
              取消
            </GlassButton>
            <GlassButton variant="primary" :disabled="submitting" @click="save">
              {{ submitting ? '保存中…' : '保存' }}
            </GlassButton>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
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
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-elevated);
  overflow: hidden;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5) var(--space-5) var(--space-3);
}

.head h2 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
}

.close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  transition: all 0.2s var(--ease-out-soft);
}
.close:hover {
  color: var(--text-primary);
  background: var(--bg-sunken);
}

.body {
  padding: var(--space-2) var(--space-5);
  display: grid;
  gap: var(--space-4);
  overflow-y: auto;
}

/* ---------- 图标预览 + URL 抓 logo ---------- */
.icon-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.icon-preview {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  flex-shrink: 0;
  overflow: hidden;
  font-size: 18px;
}
.icon-preview img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}
.icon-input {
  flex: 1;
}

.url-row {
  display: flex;
  gap: 8px;
}
.url-row .input {
  flex: 1;
}
.logo-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 12px;
  border-radius: var(--radius-md);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s var(--ease-out-soft);
}
.logo-btn:hover:not(:disabled) {
  color: var(--aurora-1);
  border-color: var(--line-accent);
  background: rgba(207, 69, 32, 0.06);
}
.logo-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.logo-btn .spin {
  animation: lb-spin 1s linear infinite;
}
@keyframes lb-spin {
  to { transform: rotate(360deg); }
}

.logo-candidates {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.cand-label {
  font-size: 11px;
  color: var(--text-muted);
}
.cand-img {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  display: grid;
  place-items: center;
  cursor: pointer;
  padding: 3px;
  overflow: hidden;
  transition: all 0.15s var(--ease-out-soft);
}
.cand-img:hover {
  border-color: var(--line-strong);
}
.cand-img.on {
  border-color: var(--aurora-1);
  box-shadow: 0 0 0 2px rgba(207, 69, 32, 0.18);
}
.cand-img img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

/* ---------- 仅管理员可见 ---------- */
.visibility-row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 12px var(--space-4);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  transition: border-color 0.2s var(--ease-out-soft), background 0.2s var(--ease-out-soft);
}
.visibility-row.active {
  border-color: rgba(245, 158, 11, 0.4);
  background: rgba(245, 158, 11, 0.06);
}
.vis-text {
  flex: 1;
  min-width: 0;
}
.vis-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.visibility-row.active .vis-title {
  color: #d97706;
}
.vis-sub {
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.5;
  margin-top: 2px;
}

label {
  display: grid;
  gap: 6px;
}
label > span,
.label {
  font-size: 12px;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 500;
}

.row {
  display: grid;
  grid-template-columns: 1fr 160px;
  gap: var(--space-3);
}

.input {
  height: 40px;
  padding: 0 var(--space-3);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: 13.5px;
  transition: all 0.15s var(--ease-out-soft);
  width: 100%;
}
.input:focus {
  border-color: var(--line-accent);
  background: var(--bg-elevated);
  box-shadow: 0 0 0 3px rgba(207, 69, 32, 0.14);
}
.textarea {
  height: auto;
  padding: var(--space-3);
  font-family: var(--font-sans);
  resize: vertical;
  min-height: 60px;
}

.pin-field {
  display: grid;
  gap: 6px;
}

.toggle {
  height: 40px;
  width: 64px;
  border-radius: var(--radius-full);
  border: 1px solid var(--line);
  background: var(--bg-sunken);
  position: relative;
  transition: all 0.2s var(--ease-out-soft);
}
.toggle .dot {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: all 0.25s var(--ease-out-soft);
}
.toggle.on {
  background: linear-gradient(135deg, var(--aurora-1), var(--aurora-2));
  border-color: transparent;
}
.toggle.on .dot {
  background: #fff;
  left: 30px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.color-field {
  display: grid;
  gap: 6px;
}
.colors {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  align-items: center;
}
.color-dot {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid transparent;
  transition: all 0.2s var(--ease-out-soft);
  position: relative;
}
.color-dot:hover {
  transform: scale(1.1);
}
.color-dot.on {
  border-color: #fff;
  box-shadow: 0 0 16px currentColor;
}
.color-picker {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.err {
  margin: 0;
  color: #fca5a5;
  font-size: 12.5px;
}

.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5) var(--space-5);
  border-top: 1px solid var(--line);
}
.foot-right {
  display: flex;
  gap: var(--space-2);
  margin-left: auto;
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
