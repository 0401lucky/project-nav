<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type { OcrCandidate, Project } from '@/types'
import { useUiStore } from '@/stores/ui'
import { useProjectsStore } from '@/stores/projects'
import { api, ApiCallError } from '@/api/client'
import { nanoid } from '@/utils/id'
import GlassButton from '@/components/ui/GlassButton.vue'

interface CandidateRow {
  candidate: OcrCandidate
  selected: boolean
  name: string
}

interface OcrResp {
  candidates: OcrCandidate[]
  raw?: string
}

const ui = useUiStore()
const projects = useProjectsStore()

type State = 'upload' | 'analyzing' | 'review' | 'done'
const state = ref<State>('upload')
const error = ref('')
const previewUrl = ref('')
const candidates = ref<CandidateRow[]>([])
const sharedCategory = ref('默认')
const sharedColor = ref('#c084fc')
const submitting = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const PRESET_COLORS = [
  '#c084fc', '#22d3ee', '#f472b6', '#34d399',
  '#818cf8', '#fbbf24', '#f87171', '#60a5fa',
]

watch(
  () => ui.screenshotOpen,
  (open) => {
    if (open) {
      state.value = 'upload'
      error.value = ''
      previewUrl.value = ''
      candidates.value = []
      sharedCategory.value = projects.categories[0] || '默认'
    }
  },
)

async function handleFile(file: File) {
  if (!file.type.startsWith('image/')) {
    error.value = '请提供图片文件'
    return
  }
  if (file.size > 8 * 1024 * 1024) {
    error.value = '图片过大（>8MB），请压缩后再试'
    return
  }
  const reader = new FileReader()
  reader.onload = async (e) => {
    const dataUrl = e.target?.result as string
    previewUrl.value = dataUrl
    state.value = 'analyzing'
    error.value = ''
    try {
      const resp = await api.post<OcrResp>(
        '/api/ocr',
        { image: dataUrl, mime: file.type },
        { auth: true },
      )
      if (!resp.candidates || resp.candidates.length === 0) {
        error.value = resp.raw
          ? `未识别到结构化结果。原始返回：\n${resp.raw.slice(0, 240)}`
          : '未识别到任何项目，换张更清晰的截图试试。'
        state.value = 'upload'
        return
      }
      candidates.value = resp.candidates.map((c) => ({
        candidate: c,
        selected: true,
        name: c.name,
      }))
      state.value = 'review'
    } catch (e) {
      error.value = e instanceof ApiCallError ? e.message : 'OCR 调用失败'
      state.value = 'upload'
    }
  }
  reader.readAsDataURL(file)
}

function onSelectFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  if (f) handleFile(f)
  input.value = ''
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  const f = e.dataTransfer?.files?.[0]
  if (f) handleFile(f)
}
function onDragOver(e: DragEvent) {
  e.preventDefault()
}

function onPaste(e: ClipboardEvent) {
  if (!ui.screenshotOpen) return
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile()
      if (f) {
        e.preventDefault()
        handleFile(f)
        return
      }
    }
  }
}

onMounted(() => document.addEventListener('paste', onPaste))
onBeforeUnmount(() => document.removeEventListener('paste', onPaste))

async function importSelected() {
  if (submitting.value) return
  const picked = candidates.value.filter((c) => c.selected)
  if (picked.length === 0) {
    error.value = '请至少勾选一个项目'
    return
  }
  submitting.value = true
  error.value = ''
  try {
    const newProjects: Project[] = picked.map((row, idx) => ({
      id: nanoid(8),
      name: row.name.trim() || row.candidate.name,
      url: row.candidate.url,
      category: sharedCategory.value.trim() || '默认',
      accentColor: sharedColor.value,
      createdAt: Date.now() + idx,
      visits: 0,
    }))
    await projects.bulkAdd(newProjects)
    state.value = 'done'
  } catch (e) {
    error.value = e instanceof ApiCallError ? e.message : '导入失败'
  } finally {
    submitting.value = false
  }
}

function reset() {
  state.value = 'upload'
  previewUrl.value = ''
  candidates.value = []
  error.value = ''
}
function close() {
  if (submitting.value) return
  ui.screenshotOpen = false
}
function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}
</script>

<template>
  <Transition name="modal">
    <div v-if="ui.screenshotOpen" class="backdrop" @click="onBackdropClick">
      <div class="modal" role="dialog" aria-modal="true">
        <header class="head">
          <h2>截图导入</h2>
          <button class="close" aria-label="关闭" type="button" @click="close">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3l10 10M13 3L3 13" stroke-linecap="round"/>
            </svg>
          </button>
        </header>

        <div v-if="state === 'upload'" class="body">
          <div
            class="drop-zone"
            @drop="onDrop"
            @dragover="onDragOver"
            @click="fileInput?.click()"
          >
            <div class="orb">📋</div>
            <div class="hint">
              <strong>拖拽图片到这里</strong>
              <span>或 粘贴 (Ctrl+V) / 点击选择文件</span>
            </div>
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              hidden
              @change="onSelectFile"
            />
          </div>
          <p class="tip">
            适合 Cloudflare、Zeabur、Vercel 控制台截图。AI 会自动识别「项目名 + URL」。
          </p>
          <p v-if="error" class="err">{{ error }}</p>
        </div>

        <div v-else-if="state === 'analyzing'" class="body">
          <div class="analyzing">
            <img v-if="previewUrl" :src="previewUrl" class="preview" alt="" />
            <div class="orb-loader">
              <div class="orb-spin"></div>
              <span>AI 正在识别…</span>
            </div>
          </div>
        </div>

        <div v-else-if="state === 'review'" class="body">
          <div class="cat-row">
            <label>
              <span>统一分类</span>
              <input
                v-model="sharedCategory"
                class="input"
                list="cat-import"
                placeholder="例如 工具 / AI"
              />
              <datalist id="cat-import">
                <option v-for="c in projects.categories" :key="c" :value="c" />
              </datalist>
            </label>
            <label class="color-label">
              <span>统一颜色</span>
              <div class="color-row">
                <button
                  v-for="c in PRESET_COLORS"
                  :key="c"
                  type="button"
                  class="color"
                  :class="{ on: sharedColor === c }"
                  :style="{ background: c }"
                  @click="sharedColor = c"
                ></button>
              </div>
            </label>
          </div>
          <div class="rows">
            <label
              v-for="(row, i) in candidates"
              :key="i"
              class="cand-row"
              :class="{ off: !row.selected }"
            >
              <input v-model="row.selected" type="checkbox" />
              <div class="cand-meta">
                <input v-model="row.name" class="input cand-name" />
                <span class="cand-url">{{ row.candidate.url }}</span>
              </div>
            </label>
          </div>
          <p v-if="error" class="err">{{ error }}</p>
        </div>

        <div v-else class="body done">
          <div class="orb">✨</div>
          <h3>已导入</h3>
          <p>勾选的项目已经加入你的导航站。</p>
        </div>

        <footer class="foot">
          <GlassButton v-if="state === 'review'" variant="ghost" @click="reset">
            重新选图
          </GlassButton>
          <div class="foot-right">
            <GlassButton variant="ghost" :disabled="submitting" @click="close">
              {{ state === 'done' ? '关闭' : '取消' }}
            </GlassButton>
            <GlassButton
              v-if="state === 'review'"
              variant="primary"
              :disabled="submitting"
              @click="importSelected"
            >
              {{ submitting ? '导入中…' : `导入 ${candidates.filter((c) => c.selected).length} 项` }}
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
  z-index: 95;
  display: grid;
  place-items: center;
  background: rgba(30, 25, 20, 0.45);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: var(--space-4);
}

.modal {
  width: 100%;
  max-width: 620px;
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
.head h2 { margin: 0; font-size: 1.15rem; font-weight: 700; }

.close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  transition: all 0.2s var(--ease-out-soft);
}
.close:hover { color: var(--text-primary); background: var(--bg-sunken); }

.body {
  padding: var(--space-2) var(--space-5);
  display: grid;
  gap: var(--space-4);
  overflow-y: auto;
}

.drop-zone {
  border: 1.5px dashed var(--line-strong);
  border-radius: var(--radius-lg);
  padding: var(--space-7) var(--space-4);
  display: grid;
  gap: var(--space-3);
  place-items: center;
  cursor: pointer;
  transition: all 0.2s var(--ease-out-soft);
  background: var(--bg-sunken);
}
.drop-zone:hover {
  border-color: var(--line-accent);
  background: var(--bg-elevated);
}

.orb {
  font-size: 36px;
}

.hint { text-align: center; display: grid; gap: 4px; }
.hint strong { color: var(--text-primary); font-size: 14px; font-weight: 600; }
.hint span { color: var(--text-muted); font-size: 12.5px; }

.tip {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
}

.err {
  margin: 0;
  color: #ef4444;
  font-size: 12.5px;
  background: rgba(239, 68, 68, 0.06);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  white-space: pre-wrap;
  border: 1px solid rgba(239, 68, 68, 0.25);
}

.analyzing {
  display: grid;
  gap: var(--space-4);
  place-items: center;
  padding: var(--space-4) 0;
}

.preview {
  max-width: 100%;
  max-height: 240px;
  border-radius: var(--radius-md);
  border: 1px solid var(--line);
}

.orb-loader {
  display: grid;
  gap: var(--space-3);
  place-items: center;
  color: var(--text-muted);
  font-size: 13px;
}
.orb-spin {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    var(--aurora-1),
    var(--aurora-2),
    var(--aurora-3),
    var(--aurora-1)
  );
  animation: spin 1.4s linear infinite;
  position: relative;
}
.orb-spin::after {
  content: '';
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  background: var(--bg-elevated);
}
@keyframes spin { to { transform: rotate(360deg); } }

.cat-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--space-3);
}
.cat-row label { display: grid; gap: 6px; }
.cat-row span {
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
  width: 100%;
  transition: border-color 0.15s var(--ease-out-soft), box-shadow 0.15s var(--ease-out-soft);
}
.input:focus {
  border-color: var(--line-accent);
  background: var(--bg-elevated);
  box-shadow: 0 0 0 3px rgba(207, 69, 32, 0.12);
}

.color-row {
  display: flex;
  gap: 4px;
  align-items: center;
  height: 38px;
}
.color {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  transition: all 0.15s;
}
.color.on { border-color: var(--text-primary); box-shadow: 0 0 0 2px rgba(255,255,255,0.6), 0 0 12px currentColor; }

.rows {
  display: grid;
  gap: var(--space-2);
  max-height: 280px;
  overflow-y: auto;
  padding-right: 2px;
}

.cand-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  transition: all 0.15s var(--ease-out-soft);
  cursor: pointer;
}
.cand-row.off { opacity: 0.5; }
.cand-row:hover { border-color: var(--line-strong); background: var(--bg-elevated); }

.cand-row input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--aurora-1);
}

.cand-meta {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.cand-name {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 14px;
  height: auto;
  font-weight: 500;
}
.cand-name:focus {
  background: var(--bg-elevated);
  padding: 2px 8px;
  border-radius: 4px;
  outline: none;
  box-shadow: 0 0 0 2px rgba(207, 69, 32, 0.18);
}
.cand-url {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.done { text-align: center; padding: var(--space-6) var(--space-4); }
.done h3 { margin: var(--space-3) 0 var(--space-2); }
.done p { margin: 0; color: var(--text-secondary); font-size: 13px; }

.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-5) var(--space-5);
  border-top: 1px solid var(--line);
  margin-top: var(--space-3);
}
.foot-right {
  display: flex;
  gap: var(--space-2);
  margin-left: auto;
}

.modal-enter-active, .modal-leave-active {
  transition: opacity 0.25s var(--ease-out-soft);
}
.modal-enter-active .modal, .modal-leave-active .modal {
  transition: transform 0.3s var(--ease-out-soft);
}
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal, .modal-leave-to .modal {
  transform: translateY(20px) scale(0.96);
}
</style>
