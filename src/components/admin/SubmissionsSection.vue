<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Submission, SubmissionStatus } from '@/types'
import { useSubmissionsStore } from '@/stores/submissions'
import { ApiCallError } from '@/api/client'
import GlassButton from '@/components/ui/GlassButton.vue'

const emit = defineEmits<{
  (e: 'flash', kind: 'ok' | 'err', msg: string): void
}>()

const submissions = useSubmissionsStore()

const filter = ref<SubmissionStatus | 'all'>('pending')
const expandId = ref<string | null>(null)
// 审核编辑态：以 submission.id 为 key 的 edits map
const edits = ref<Record<string, {
  name: string
  url: string
  description: string
  category: string
  icon: string
  accentColor: string
  pinned: boolean
  private: boolean
}>>({})

const filtered = computed(() => {
  if (filter.value === 'all') return submissions.items
  return submissions.items.filter((s) => s.status === filter.value)
})

onMounted(async () => {
  try {
    await submissions.loadAdminList()
  } catch {
    /* 错误已在 store 中处理 */
  }
})

function ensureEdits(s: Submission) {
  if (edits.value[s.id]) return edits.value[s.id]
  const e = {
    name: s.name,
    url: s.url,
    description: s.description || '',
    category: s.category || '默认',
    icon: s.iconUrl || '',
    accentColor: s.accentColor || '#8b5cf6',
    pinned: false,
    private: false,
  }
  edits.value[s.id] = e
  return e
}

function toggleExpand(s: Submission) {
  if (expandId.value === s.id) {
    expandId.value = null
  } else {
    ensureEdits(s)
    expandId.value = s.id
  }
}

async function approve(s: Submission) {
  const e = ensureEdits(s)
  try {
    await submissions.approve(s.id, {
      name: e.name.trim(),
      url: e.url.trim(),
      description: e.description.trim() || undefined,
      category: e.category.trim() || '默认',
      icon: e.icon.trim() || undefined,
      accentColor: e.accentColor,
      pinned: e.pinned,
      private: e.private,
    })
    expandId.value = null
    emit('flash', 'ok', `已通过：${e.name}`)
  } catch (err) {
    emit(
      'flash',
      'err',
      err instanceof ApiCallError ? err.message : '通过失败',
    )
  }
}

async function reject(s: Submission) {
  const note = window.prompt('拒绝理由（可选，会保留备查）：')
  if (note === null) return
  try {
    await submissions.reject(s.id, note || undefined)
    emit('flash', 'ok', '已拒绝')
  } catch (err) {
    emit(
      'flash',
      'err',
      err instanceof ApiCallError ? err.message : '拒绝失败',
    )
  }
}

async function remove(s: Submission) {
  if (!window.confirm(`确定从队列删除「${s.name}」？这条记录会消失。`)) return
  try {
    await submissions.remove(s.id)
    emit('flash', 'ok', '已删除')
  } catch (err) {
    emit(
      'flash',
      'err',
      err instanceof ApiCallError ? err.message : '删除失败',
    )
  }
}

function fmtTime(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(s: SubmissionStatus): string {
  return s === 'pending' ? '待审核' : s === 'approved' ? '已通过' : '已拒绝'
}
</script>

<template>
  <div class="subs">
    <header class="head-bar">
      <div class="filters">
        <button
          class="filter-btn"
          :class="{ on: filter === 'pending' }"
          type="button"
          @click="filter = 'pending'"
        >
          待审核
          <span class="badge pending">{{ submissions.stats.pending }}</span>
        </button>
        <button
          class="filter-btn"
          :class="{ on: filter === 'approved' }"
          type="button"
          @click="filter = 'approved'"
        >
          已通过 <span class="badge">{{ submissions.stats.approved }}</span>
        </button>
        <button
          class="filter-btn"
          :class="{ on: filter === 'rejected' }"
          type="button"
          @click="filter = 'rejected'"
        >
          已拒绝 <span class="badge">{{ submissions.stats.rejected }}</span>
        </button>
        <button
          class="filter-btn"
          :class="{ on: filter === 'all' }"
          type="button"
          @click="filter = 'all'"
        >
          全部 <span class="badge">{{ submissions.stats.total }}</span>
        </button>
      </div>
      <button
        class="refresh"
        type="button"
        :disabled="submissions.loading"
        @click="submissions.loadAdminList()"
      >
        <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" :class="{ spin: submissions.loading }">
          <path d="M12 7a5 5 0 11-1.5-3.5"/>
          <path d="M12 2v3.5h-3.5"/>
        </svg>
        刷新
      </button>
    </header>

    <div v-if="submissions.loading && filtered.length === 0" class="empty">
      加载中…
    </div>

    <div v-else-if="filtered.length === 0" class="empty">
      <div class="empty-icon">📭</div>
      <p>{{ filter === 'pending' ? '暂无待审核投稿' : filter === 'approved' ? '还没通过任何投稿' : filter === 'rejected' ? '还没拒绝过投稿' : '投稿队列为空' }}</p>
    </div>

    <div v-else class="list">
      <article
        v-for="s in filtered"
        :key="s.id"
        class="row"
        :class="`status-${s.status}`"
      >
        <header class="row-head" @click="toggleExpand(s)">
          <div
            class="row-icon"
            :style="{
              background: `linear-gradient(135deg, ${s.accentColor || '#8b5cf6'}22, ${s.accentColor || '#8b5cf6'}08)`,
              borderColor: (s.accentColor || '#8b5cf6') + '33',
            }"
          >
            <img
              v-if="s.iconUrl"
              :src="s.iconUrl"
              alt=""
              class="row-icon-img"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
            />
            <span v-else>{{ s.name.charAt(0).toUpperCase() }}</span>
          </div>
          <div class="row-meta">
            <div class="row-title">
              <span class="row-name">{{ s.name }}</span>
              <span class="row-status" :class="s.status">{{ statusLabel(s.status) }}</span>
            </div>
            <a class="row-url" :href="s.url" target="_blank" rel="noopener" @click.stop>{{ s.url }}</a>
            <p v-if="s.description" class="row-desc">{{ s.description }}</p>
          </div>
          <div class="row-side">
            <span class="row-time">{{ fmtTime(s.submittedAt) }}</span>
          </div>
        </header>

        <!-- 展开后：投稿者信息 + 审核动作 -->
        <Transition name="expand">
          <div v-if="expandId === s.id" class="row-detail">
            <div class="info-grid">
              <div v-if="s.contact" class="info">
                <span class="info-label">联系方式</span>
                <span class="info-value">{{ s.contact }}</span>
              </div>
              <div v-if="s.reason" class="info reason">
                <span class="info-label">推荐理由</span>
                <span class="info-value">{{ s.reason }}</span>
              </div>
              <div v-if="s.ip" class="info">
                <span class="info-label">来源 IP</span>
                <span class="info-value mono">{{ s.ip }}</span>
              </div>
              <div v-if="s.reviewNote" class="info">
                <span class="info-label">审核备注</span>
                <span class="info-value">{{ s.reviewNote }}</span>
              </div>
              <div v-if="s.reviewedAt" class="info">
                <span class="info-label">审核时间</span>
                <span class="info-value">{{ fmtTime(s.reviewedAt) }}</span>
              </div>
            </div>

            <!-- 仅 pending 才显示编辑+审核 -->
            <div v-if="s.status === 'pending'" class="edit-area">
              <h4>审核前可编辑</h4>
              <div class="edit-grid">
                <label class="ef">
                  <span>名称</span>
                  <input v-model="edits[s.id].name" class="ei" />
                </label>
                <label class="ef">
                  <span>URL</span>
                  <input v-model="edits[s.id].url" class="ei" />
                </label>
                <label class="ef wide">
                  <span>描述</span>
                  <input v-model="edits[s.id].description" class="ei" />
                </label>
                <label class="ef">
                  <span>分类</span>
                  <input v-model="edits[s.id].category" class="ei" />
                </label>
                <label class="ef">
                  <span>图标 URL / emoji</span>
                  <input v-model="edits[s.id].icon" class="ei" />
                </label>
                <label class="ef checkbox">
                  <input v-model="edits[s.id].pinned" type="checkbox" />
                  <span>置顶</span>
                </label>
                <label class="ef checkbox">
                  <input v-model="edits[s.id].private" type="checkbox" />
                  <span>仅管理员可见</span>
                </label>
              </div>

              <div class="action-row">
                <GlassButton variant="ghost" size="sm" :disabled="submissions.acting" @click="remove(s)">
                  删除
                </GlassButton>
                <span class="spacer"></span>
                <GlassButton variant="danger" size="sm" :disabled="submissions.acting" @click="reject(s)">
                  拒绝
                </GlassButton>
                <GlassButton variant="primary" size="sm" :disabled="submissions.acting" @click="approve(s)">
                  通过并发布
                </GlassButton>
              </div>
            </div>

            <!-- 已审核状态：仅给删除按钮 -->
            <div v-else class="action-row">
              <span class="spacer"></span>
              <GlassButton variant="ghost" size="sm" :disabled="submissions.acting" @click="remove(s)">
                从队列删除
              </GlassButton>
            </div>
          </div>
        </Transition>
      </article>
    </div>
  </div>
</template>

<style scoped>
.subs {
  display: grid;
  gap: var(--space-3);
}

/* ---------- 头部筛选 ---------- */
.head-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.filters {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.filter-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: var(--radius-full);
  background: transparent;
  border: 1px solid var(--line);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s var(--ease-out-soft);
}
.filter-btn:hover {
  color: var(--text-primary);
  background: var(--bg-sunken);
}
.filter-btn.on {
  background: var(--bg-sunken);
  border-color: var(--line-strong);
  color: var(--text-primary);
}
.badge {
  font-family: var(--font-mono);
  font-size: 10.5px;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  color: var(--text-muted);
  padding: 1px 6px;
  border-radius: var(--radius-full);
  min-width: 16px;
  text-align: center;
}
.filter-btn.on .badge {
  background: var(--bg-elevated);
}
.badge.pending {
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
  border-color: rgba(245, 158, 11, 0.35);
}

.refresh {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--radius-full);
  background: transparent;
  border: 1px solid var(--line);
  color: var(--text-muted);
  font-size: 11.5px;
  cursor: pointer;
}
.refresh:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--line-strong);
}
.spin {
  animation: sp 1s linear infinite;
}
@keyframes sp {
  to { transform: rotate(360deg); }
}

/* ---------- 空态 ---------- */
.empty {
  padding: var(--space-7) var(--space-4);
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}
.empty-icon {
  font-size: 32px;
  margin-bottom: var(--space-2);
}

/* ---------- 列表 ---------- */
.list {
  display: grid;
  gap: 8px;
}

.row {
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: border-color 0.15s var(--ease-out-soft);
}
.row.status-pending {
  border-left: 3px solid #d97706;
}
.row.status-approved {
  border-left: 3px solid #10b981;
  opacity: 0.85;
}
.row.status-rejected {
  border-left: 3px solid var(--text-subtle);
  opacity: 0.6;
}
.row:hover {
  border-color: var(--line-strong);
}
.row.status-pending:hover {
  border-left-color: #d97706;
}

.row-head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-3);
  padding: 12px var(--space-4);
  align-items: center;
  cursor: pointer;
}

.row-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-secondary);
  border: 1px solid;
  flex-shrink: 0;
  overflow: hidden;
}
.row-icon-img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.row-meta {
  min-width: 0;
}
.row-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.row-name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}
.row-status {
  font-size: 10.5px;
  padding: 1px 7px;
  border-radius: var(--radius-full);
  font-weight: 500;
}
.row-status.pending {
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
  border: 1px solid rgba(245, 158, 11, 0.3);
}
.row-status.approved {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
  border: 1px solid rgba(16, 185, 129, 0.3);
}
.row-status.rejected {
  background: var(--bg-sunken);
  color: var(--text-muted);
  border: 1px solid var(--line);
}

.row-url {
  display: block;
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-url:hover {
  color: var(--aurora-1);
}
.row-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.row-side {
  text-align: right;
  flex-shrink: 0;
}
.row-time {
  font-size: 10.5px;
  font-family: var(--font-mono);
  color: var(--text-muted);
}

/* ---------- 详情区 ---------- */
.row-detail {
  padding: var(--space-3) var(--space-4) var(--space-4);
  border-top: 1px solid var(--line);
  background: var(--bg-sunken);
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px var(--space-4);
  margin-bottom: var(--space-3);
}
.info.reason {
  grid-column: 1 / -1;
}
.info-label {
  display: block;
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 2px;
}
.info-value {
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.5;
  word-break: break-all;
}
.info-value.mono {
  font-family: var(--font-mono);
}

.edit-area h4 {
  margin: 0 0 8px;
  font-size: 11.5px;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 600;
}
.edit-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.ef {
  display: grid;
  gap: 3px;
}
.ef.wide { grid-column: 1 / -1; }
.ef.checkbox {
  flex-direction: row;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}
.ef.checkbox input {
  accent-color: var(--aurora-1);
}
.ef > span {
  font-size: 10.5px;
  color: var(--text-muted);
}
.ei {
  height: 30px;
  padding: 0 8px;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-primary);
}
.ei:focus {
  outline: none;
  border-color: var(--line-accent);
  box-shadow: 0 0 0 2px rgba(207, 69, 32, 0.15);
}

.action-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: var(--space-3);
}
.spacer { flex: 1; }

.expand-enter-active,
.expand-leave-active {
  transition: opacity 0.2s var(--ease-out-soft);
}
.expand-enter-from,
.expand-leave-to { opacity: 0; }

@media (max-width: 600px) {
  .row-head { grid-template-columns: auto 1fr; }
  .row-side { display: none; }
  .info-grid, .edit-grid { grid-template-columns: 1fr; }
}
</style>
