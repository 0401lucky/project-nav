<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { ProjectDraft, AiMode, Project } from '@/types'
import { useUiStore } from '@/stores/ui'
import { useProjectsStore } from '@/stores/projects'
import { api, ApiCallError } from '@/api/client'
import { nanoid } from '@/utils/id'
import GlassButton from '@/components/ui/GlassButton.vue'

interface DraftRow {
  draft: ProjectDraft
  selected: boolean
}

const ui = useUiStore()
const projects = useProjectsStore()

const isMacPlatform =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

const mode = ref<AiMode>('url')
const input = ref('')
const inputEl = ref<HTMLTextAreaElement | null>(null)
const analyzing = ref(false)
const importing = ref(false)
const error = ref('')
const drafts = ref<DraftRow[]>([])
const lastRunMode = ref<AiMode | null>(null)

const placeholder = computed(() => {
  if (mode.value === 'url')
    return '粘贴一个 URL\n\n例如：\nhttps://linear.app'
  if (mode.value === 'urls')
    return '一行一个 URL，最多 12 个\n\n例如：\nhttps://github.com\nhttps://vercel.com\nfigma.com\nlinear.app'
  return '用自然语言描述你想加哪些站点\n\n例如：\n- 我常用的 AI 工具：ChatGPT、Claude、Gemini\n- 给我加 5 个国内开源镜像\n- 帮我加常用的代码托管平台'
})

const selectedCount = computed(
  () => drafts.value.filter((r) => r.selected).length,
)

watch(
  () => ui.aiWorkbenchOpen,
  async (open) => {
    if (open) {
      mode.value = 'url'
      input.value = ''
      drafts.value = []
      error.value = ''
      lastRunMode.value = null
      await nextTick()
      inputEl.value?.focus()
    }
  },
)

async function analyze() {
  const trimmed = input.value.trim()
  if (!trimmed) {
    error.value = '请先输入内容'
    return
  }
  if (analyzing.value) return
  analyzing.value = true
  error.value = ''
  drafts.value = []
  try {
    const resp = await api.post<{ drafts: ProjectDraft[] }>(
      '/api/admin/ai',
      { mode: mode.value, input: trimmed },
      { auth: true },
    )
    drafts.value = (resp.drafts || []).map((d) => ({ draft: d, selected: true }))
    lastRunMode.value = mode.value
    if (drafts.value.length === 0) {
      error.value = 'AI 没生成任何卡片，换种描述再试'
    }
  } catch (e) {
    if (e instanceof ApiCallError) {
      error.value = e.message + (e.payload.detail ? '：' + e.payload.detail : '')
    } else {
      error.value = '分析失败'
    }
  } finally {
    analyzing.value = false
  }
}

function patchDraft(idx: number, field: keyof ProjectDraft, value: string) {
  const cur = drafts.value[idx]
  if (!cur) return
  drafts.value[idx] = {
    ...cur,
    draft: { ...cur.draft, [field]: value },
  }
}

async function importSelected() {
  const picked = drafts.value.filter((r) => r.selected)
  if (picked.length === 0) {
    error.value = '请至少勾选一项'
    return
  }
  if (importing.value) return
  importing.value = true
  error.value = ''
  try {
    const existing = new Set(projects.items.map((p) => p.url))
    const added: Project[] = []
    for (const row of picked) {
      const d = row.draft
      if (existing.has(d.url)) continue
      // 优先用 AI 抓到的真实 logo 图片地址；没有则回退 emoji
      const iconValue = d.iconUrl ? d.iconUrl : d.icon
      added.push({
        id: nanoid(8),
        name: d.name,
        url: d.url,
        description: d.description,
        category: d.category || '默认',
        icon: iconValue,
        accentColor: d.accentColor,
        createdAt: Date.now() + added.length,
        visits: 0,
      })
      existing.add(d.url)
    }
    if (added.length === 0) {
      error.value = '勾选的项目都已存在'
      return
    }
    await projects.bulkAdd(added)
    drafts.value = []
    input.value = ''
    error.value = ''
  } catch (e) {
    error.value = e instanceof ApiCallError ? e.message : '导入失败'
  } finally {
    importing.value = false
  }
}

function close() {
  if (analyzing.value || importing.value) return
  ui.aiWorkbenchOpen = false
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    analyze()
  }
}
</script>

<template>
  <Transition name="modal">
    <div v-if="ui.aiWorkbenchOpen" class="backdrop" @click="onBackdropClick">
      <div class="panel" role="dialog" aria-modal="true">
        <header class="head">
          <div class="title-block">
            <div class="head-mark">
              <span class="hm-orb"></span>
              <span class="hm-pulse"></span>
            </div>
            <div>
              <h2>AI 工作台</h2>
              <p class="subtitle">贴 URL 或描述你想要的，AI 帮你抓取与归类</p>
            </div>
          </div>
          <button type="button" class="close" aria-label="关闭" @click="close">
            <svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3l8 8M11 3l-8 8" stroke-linecap="round" />
            </svg>
          </button>
        </header>

        <div class="mode-bar">
          <button
            type="button"
            class="mode-btn"
            :class="{ on: mode === 'url' }"
            @click="mode = 'url'"
          >
            <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M5 9a3 3 0 003 3l2-2a3 3 0 00-4-4M9 5a3 3 0 00-3-3L4 4a3 3 0 004 4" />
            </svg>
            单个链接
          </button>
          <button
            type="button"
            class="mode-btn"
            :class="{ on: mode === 'urls' }"
            @click="mode = 'urls'"
          >
            <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M3 4h8M3 7h8M3 10h6" stroke-linecap="round" />
            </svg>
            批量链接
          </button>
          <button
            type="button"
            class="mode-btn"
            :class="{ on: mode === 'prompt' }"
            @click="mode = 'prompt'"
          >
            <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M2 11l1-3a4 4 0 014-4h3a4 4 0 010 8H6l-2 2-2-2v-1z" stroke-linejoin="round" />
            </svg>
            自然语言
          </button>
        </div>

        <div class="input-area">
          <textarea
            ref="inputEl"
            v-model="input"
            class="input-box"
            :placeholder="placeholder"
            :disabled="analyzing"
            spellcheck="false"
            @keydown="onKeydown"
          ></textarea>
          <div class="input-hint">
            <span class="hint-text">
              <kbd>{{ isMacPlatform ? '⌘' : 'Ctrl' }}</kbd>
              <kbd>Enter</kbd>
              发送
            </span>
            <GlassButton
              variant="primary"
              size="sm"
              :disabled="analyzing || !input.trim()"
              @click="analyze"
            >
              <svg v-if="!analyzing" viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M2 7h10M8 3l4 4-4 4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <svg v-else class="spin" viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M12 7a5 5 0 11-1.5-3.5" stroke-linecap="round" />
              </svg>
              {{ analyzing ? '分析中…' : '让 AI 分析' }}
            </GlassButton>
          </div>
        </div>

        <p v-if="error" class="err">{{ error }}</p>

        <div v-if="drafts.length > 0" class="results">
          <div class="results-head">
            <span class="results-title">
              AI 生成 {{ drafts.length }} 张卡片
              <span v-if="lastRunMode === 'prompt'" class="src-tag inferred">未抓取页面</span>
              <span v-else class="src-tag fetched">已抓取页面</span>
            </span>
            <span class="results-meta">已选 {{ selectedCount }}</span>
          </div>

          <div class="draft-list">
            <div
              v-for="(row, i) in drafts"
              :key="i"
              class="draft-row"
              :class="{ off: !row.selected }"
            >
              <input
                v-model="row.selected"
                type="checkbox"
                class="row-check"
              />
              <div
                class="row-icon"
                :style="{
                  background: `linear-gradient(135deg, ${row.draft.accentColor}22, ${row.draft.accentColor}08)`,
                  borderColor: row.draft.accentColor + '33',
                }"
              >
                <img
                  v-if="row.draft.iconUrl"
                  :src="row.draft.iconUrl"
                  alt=""
                  class="row-icon-img"
                  @error="($event.target as HTMLImageElement).style.display = 'none'"
                />
                <span v-else>{{ row.draft.icon || '🔗' }}</span>
              </div>
              <div class="row-meta">
                <input
                  :value="row.draft.name"
                  class="row-name"
                  placeholder="名称"
                  @input="patchDraft(i, 'name', ($event.target as HTMLInputElement).value)"
                />
                <input
                  :value="row.draft.url"
                  class="row-url"
                  placeholder="URL"
                  @input="patchDraft(i, 'url', ($event.target as HTMLInputElement).value)"
                />
                <input
                  :value="row.draft.description"
                  class="row-desc"
                  placeholder="描述"
                  @input="patchDraft(i, 'description', ($event.target as HTMLInputElement).value)"
                />
                <div class="row-tags">
                  <input
                    :value="row.draft.category"
                    class="row-cat"
                    placeholder="分类"
                    @input="patchDraft(i, 'category', ($event.target as HTMLInputElement).value)"
                  />
                  <span
                    class="row-color-dot"
                    :style="{ background: row.draft.accentColor }"
                    :title="row.draft.accentColor"
                  ></span>
                  <span v-if="row.draft.warning" class="row-warn" :title="row.draft.warning">
                    ⚠ 抓取失败
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer class="foot">
          <span v-if="drafts.length > 0" class="foot-tip">
            可以逐项编辑，确认后一键导入
          </span>
          <span v-else class="foot-tip">
            首次使用需先在「后台管理」配置 LLM 渠道（设为 OCR 渠道，AI 工作台共用）
          </span>
          <div class="foot-right">
            <GlassButton variant="ghost" :disabled="analyzing || importing" @click="close">
              关闭
            </GlassButton>
            <GlassButton
              v-if="drafts.length > 0"
              variant="primary"
              :disabled="importing || selectedCount === 0"
              @click="importSelected"
            >
              {{ importing ? '导入中…' : `导入 ${selectedCount} 项` }}
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

.panel {
  width: 100%;
  max-width: 760px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-elevated);
  overflow: hidden;
  position: relative;
}

/* 顶部极光彩条 */
.panel::before {
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
  opacity: 0.8;
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
.head-mark {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--aurora-1), var(--aurora-3));
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.hm-orb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 0 12px rgba(255, 255, 255, 0.7);
}
.hm-pulse {
  position: absolute;
  inset: -4px;
  border-radius: 14px;
  border: 1px solid rgba(207, 69, 32, 0.5);
  animation: hm-pulse 2.4s var(--ease-out-soft) infinite;
}
@keyframes hm-pulse {
  0% { opacity: 0.6; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.25); }
}

h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
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
  background: var(--surface-glass);
  border-color: var(--line);
}

/* ---------- 模式切换 ---------- */
.mode-bar {
  display: flex;
  gap: 4px;
  padding: 0 var(--space-5);
  margin-bottom: var(--space-3);
}
.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s var(--ease-out-soft);
}
.mode-btn:hover {
  color: var(--text-secondary);
  background: var(--surface-glass);
}
.mode-btn.on {
  background: var(--surface-glass-strong);
  border-color: var(--line);
  color: var(--text-primary);
}

/* ---------- 输入区 ---------- */
.input-area {
  margin: 0 var(--space-5);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  display: grid;
  overflow: hidden;
  transition: border-color 0.2s var(--ease-out-soft), box-shadow 0.2s var(--ease-out-soft);
}
.input-area:focus-within {
  border-color: var(--line-accent);
  box-shadow: 0 0 0 3px rgba(207, 69, 32, 0.12);
}

.input-box {
  width: 100%;
  min-height: 110px;
  max-height: 220px;
  padding: var(--space-3);
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--text-primary);
  background: transparent;
  border: 0;
  resize: vertical;
  line-height: 1.55;
}
.input-box::placeholder {
  color: var(--text-subtle);
  white-space: pre-wrap;
}

.input-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 6px var(--space-3);
  border-top: 1px solid var(--line);
  background: var(--bg-elevated);
}
.hint-text {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10.5px;
  color: var(--text-muted);
}
kbd {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-secondary);
}

.spin {
  animation: ai-spin 1s linear infinite;
}
@keyframes ai-spin {
  to { transform: rotate(360deg); }
}

.err {
  margin: var(--space-3) var(--space-5) 0;
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
  font-size: 12px;
  border-radius: var(--radius-md);
  white-space: pre-wrap;
  line-height: 1.55;
}

/* ---------- 结果列表 ---------- */
.results {
  flex: 1;
  margin: var(--space-3) 0 0;
  padding: 0 var(--space-5);
  overflow-y: auto;
  display: grid;
  gap: var(--space-2);
}
.results-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}
.results-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.src-tag {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-weight: 500;
}
.src-tag.fetched {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}
.src-tag.inferred {
  background: rgba(251, 191, 36, 0.12);
  color: #fbbf24;
  border: 1px solid rgba(251, 191, 36, 0.3);
}
.results-meta {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.draft-list {
  display: grid;
  gap: 6px;
}

.draft-row {
  display: grid;
  grid-template-columns: auto auto 1fr;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  transition: border-color 0.15s var(--ease-out-soft), opacity 0.15s var(--ease-out-soft);
}
.draft-row:hover {
  border-color: var(--line-strong);
  background: var(--bg-elevated);
}
.draft-row.off {
  opacity: 0.5;
}

.row-check {
  margin-top: 8px;
  width: 14px;
  height: 14px;
  accent-color: var(--aurora-1);
}

.row-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-size: 16px;
  border: 1px solid;
  flex-shrink: 0;
  overflow: hidden;
}
.row-icon-img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.row-meta {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.row-name,
.row-url,
.row-desc,
.row-cat {
  background: transparent;
  border: 0;
  padding: 2px 0;
  font-size: 12px;
  color: var(--text-primary);
  width: 100%;
}
.row-name {
  font-size: 13px;
  font-weight: 600;
}
.row-name:focus,
.row-url:focus,
.row-desc:focus,
.row-cat:focus {
  outline: none;
  background: var(--bg-elevated);
  padding: 2px 6px;
  border-radius: 4px;
  box-shadow: 0 0 0 2px rgba(207, 69, 32, 0.18);
}
.row-url {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}
.row-desc {
  color: var(--text-secondary);
  font-size: 11.5px;
}

.row-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}
.row-cat {
  flex: 0 0 auto;
  width: auto;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-muted);
}
.row-color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 1px solid var(--line);
}
.row-warn {
  font-size: 10px;
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  padding: 1px 6px;
  border-radius: 4px;
}

/* ---------- footer ---------- */
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--line);
  margin-top: var(--space-3);
  flex-shrink: 0;
}
.foot-tip {
  font-size: 11px;
  color: var(--text-muted);
  flex: 1;
  min-width: 0;
}
.foot-right {
  display: flex;
  gap: 8px;
}

/* ---------- 动画 ---------- */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s var(--ease-out-soft);
}
.modal-enter-active .panel,
.modal-leave-active .panel {
  transition: transform 0.25s var(--ease-out-soft);
}
.modal-enter-from,
.modal-leave-to { opacity: 0; }
.modal-enter-from .panel,
.modal-leave-to .panel {
  transform: translateY(12px) scale(0.98);
}
</style>
