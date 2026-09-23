<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useSettingsStore } from '@/stores/settings'
import { useSubmissionsStore } from '@/stores/submissions'
import { ApiCallError } from '@/api/client'
import GlassButton from '@/components/ui/GlassButton.vue'
import LlmProviderCard from './LlmProviderCard.vue'
import PasswordSection from './PasswordSection.vue'
import SubmissionsSection from './SubmissionsSection.vue'

const ui = useUiStore()
const settings = useSettingsStore()
const submissions = useSubmissionsStore()

type Tab = 'llm' | 'submissions' | 'password'
const tab = ref<Tab>('submissions')
const flash = ref('')
const flashKind = ref<'ok' | 'err'>('ok')
let flashTimer: number | null = null

function showFlash(kind: 'ok' | 'err', msg: string) {
  flash.value = msg
  flashKind.value = kind
  if (flashTimer) window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => (flash.value = ''), 3500)
}

watch(
  () => ui.adminOpen,
  async (open) => {
    if (open) {
      // 默认进入「投稿审核」tab；如果没有 pending 才进 LLM
      try {
        await Promise.all([
          settings.load(),
          submissions.refreshStats(),
        ])
        if (submissions.stats.pending === 0 && settings.providers.length === 0) {
          tab.value = 'llm'
        } else if (submissions.stats.pending === 0) {
          tab.value = 'llm'
        } else {
          tab.value = 'submissions'
        }
      } catch (e) {
        showFlash('err', e instanceof ApiCallError ? e.message : '加载失败')
      }
    }
  },
)

async function onSave() {
  try {
    await settings.save()
    showFlash('ok', '已保存')
  } catch (e) {
    showFlash('err', e instanceof ApiCallError ? e.message : '保存失败')
  }
}

function close() {
  if (settings.saving) return
  ui.adminOpen = false
}

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) close()
}

const ocrProviderName = computed(() => settings.ocrProvider?.name || '未指定')
</script>

<template>
  <Transition name="modal">
    <div v-if="ui.adminOpen" class="backdrop" @click="onBackdropClick">
      <div class="panel" role="dialog" aria-modal="true">
        <header class="head">
          <div class="title-block">
            <h2>后台管理</h2>
            <span class="subtitle">配置 LLM 渠道、修改编辑密码</span>
          </div>
          <button class="close" type="button" aria-label="关闭" @click="close">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3l10 10M13 3L3 13" stroke-linecap="round" />
            </svg>
          </button>
        </header>

        <div class="tabs">
          <button
            class="tab"
            :class="{ on: tab === 'submissions' }"
            @click="tab = 'submissions'"
          >
            投稿审核
            <span
              class="badge"
              :class="{ urgent: submissions.stats.pending > 0 }"
            >{{ submissions.stats.pending }}</span>
          </button>
          <button
            class="tab"
            :class="{ on: tab === 'llm' }"
            @click="tab = 'llm'"
          >
            LLM 渠道
            <span class="badge">{{ settings.providers.length }}</span>
          </button>
          <button
            class="tab"
            :class="{ on: tab === 'password' }"
            @click="tab = 'password'"
          >
            编辑密码
          </button>
        </div>

        <div v-if="settings.loading && tab !== 'submissions'" class="loading">加载中…</div>

        <div v-else-if="tab === 'submissions'" class="body">
          <SubmissionsSection @flash="(kind, msg) => showFlash(kind, msg)" />
        </div>

        <div v-else-if="tab === 'llm'" class="body">
          <div class="llm-meta">
            <div class="meta-card">
              <div class="meta-label">OCR 当前使用</div>
              <div class="meta-value">{{ ocrProviderName }}</div>
            </div>
            <div v-if="settings.hasLegacyOcrEnv" class="meta-card legacy">
              <div class="meta-label">检测到旧版环境变量 OCR</div>
              <div class="meta-value">作为兜底，未配置渠道时启用</div>
            </div>
          </div>

          <div v-if="settings.providers.length === 0" class="empty">
            <div class="empty-orb">🔌</div>
            <h3>还没有 LLM 渠道</h3>
            <p>添加一个 OpenAI 兼容渠道（DeepSeek / Moonshot / 硅基流动 / OneAPI / Ollama 等都行），保存后可在此处选择 OCR 使用哪一个。</p>
            <GlassButton variant="primary" @click="settings.addProvider">添加渠道</GlassButton>
          </div>

          <div v-else class="provider-list">
            <LlmProviderCard
              v-for="(p, idx) in settings.providers"
              :key="p.id"
              :provider="p"
              :is-ocr="settings.ocrProviderId === p.id"
              @update="(next) => (settings.providers[idx] = next)"
              @remove="settings.removeProvider(p.id)"
              @set-ocr="settings.ocrProviderId = p.id"
              @clear-ocr="settings.ocrProviderId = null"
              @flash="(kind, msg) => showFlash(kind, msg)"
            />
            <button class="add-btn" type="button" @click="settings.addProvider">
              <span>＋ 添加新渠道</span>
            </button>
          </div>
        </div>

        <div v-else-if="tab === 'password'" class="body">
          <PasswordSection @flash="(kind, msg) => showFlash(kind, msg)" />
        </div>

        <footer v-if="tab === 'submissions'" class="foot">
          <Transition name="flash">
            <span
              v-if="flash"
              class="flash"
              :class="flashKind === 'ok' ? 'flash-ok' : 'flash-err'"
            >
              {{ flash }}
            </span>
          </Transition>
          <div class="foot-right">
            <GlassButton variant="ghost" @click="close">关闭</GlassButton>
          </div>
        </footer>

        <footer v-else-if="tab === 'llm' && !settings.loading" class="foot">
          <Transition name="flash">
            <span
              v-if="flash"
              class="flash"
              :class="flashKind === 'ok' ? 'flash-ok' : 'flash-err'"
            >
              {{ flash }}
            </span>
          </Transition>
          <div class="foot-right">
            <GlassButton variant="ghost" :disabled="settings.saving" @click="close">
              关闭
            </GlassButton>
            <GlassButton
              variant="primary"
              :disabled="settings.saving"
              @click="onSave"
            >
              {{ settings.saving ? '保存中…' : '保存全部' }}
            </GlassButton>
          </div>
        </footer>

        <footer v-else-if="tab === 'password'" class="foot">
          <Transition name="flash">
            <span
              v-if="flash"
              class="flash"
              :class="flashKind === 'ok' ? 'flash-ok' : 'flash-err'"
            >
              {{ flash }}
            </span>
          </Transition>
          <div class="foot-right">
            <GlassButton variant="ghost" @click="close">关闭</GlassButton>
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

.panel {
  width: 100%;
  max-width: 760px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-elevated);
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
  opacity: 0.7;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5) var(--space-5) var(--space-3);
}
.title-block {
  display: grid;
  gap: 2px;
}
.head h2 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
}
.subtitle {
  font-size: 12px;
  color: var(--text-muted);
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
  background: var(--surface-glass);
}

.tabs {
  display: flex;
  gap: var(--space-2);
  padding: 0 var(--space-5);
  border-bottom: 1px solid var(--line);
}
.tab {
  position: relative;
  background: transparent;
  border: none;
  padding: var(--space-3) var(--space-4);
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  transition: color 0.2s var(--ease-out-soft);
}
.tab.on {
  color: var(--text-primary);
}
.tab.on::after {
  content: '';
  position: absolute;
  left: var(--space-4);
  right: var(--space-4);
  bottom: -1px;
  height: 2px;
  background: linear-gradient(90deg, var(--aurora-1), var(--aurora-2));
  border-radius: 2px;
}
.badge {
  font-size: 11px;
  background: var(--surface-glass);
  color: var(--text-secondary);
  padding: 1px 6px;
  border-radius: 10px;
  border: 1px solid var(--line);
  min-width: 18px;
  text-align: center;
}
.badge.urgent {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.4);
  color: #ef4444;
  font-weight: 700;
  animation: badge-pulse 1.6s var(--ease-out-soft) infinite;
}
@keyframes badge-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  50%      { box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.18); }
}

.body {
  flex: 1;
  padding: var(--space-4) var(--space-5) var(--space-3);
  overflow-y: auto;
  display: grid;
  gap: var(--space-4);
}

.loading {
  padding: var(--space-7);
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.llm-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}
.meta-card {
  padding: var(--space-3) var(--space-4);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}
.meta-card.legacy {
  border-color: rgba(245, 158, 11, 0.4);
  background: rgba(245, 158, 11, 0.06);
}
.meta-label {
  font-size: 11px;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 4px;
}
.meta-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.empty {
  padding: var(--space-7) var(--space-5);
  text-align: center;
  display: grid;
  gap: var(--space-3);
  place-items: center;
}
.empty h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
.empty p {
  margin: 0;
  color: var(--text-muted);
  font-size: 12.5px;
  line-height: 1.7;
  max-width: 480px;
}
.empty-orb {
  font-size: 38px;
  filter: drop-shadow(0 0 16px rgba(34, 211, 238, 0.5));
}

.provider-list {
  display: grid;
  gap: var(--space-3);
}

.add-btn {
  border: 1px dashed var(--line-strong);
  background: var(--bg-sunken);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s var(--ease-out-soft);
}
.add-btn:hover {
  border-color: var(--line-accent);
  color: var(--text-primary);
  background: var(--bg-elevated);
}

.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--line);
  gap: var(--space-3);
  flex-shrink: 0;
}
.foot-right {
  display: flex;
  gap: var(--space-2);
  margin-left: auto;
}
.flash {
  font-size: 12.5px;
  padding: 4px 10px;
  border-radius: var(--radius-md);
  border: 1px solid;
}
.flash-ok {
  color: #34d399;
  background: rgba(52, 211, 153, 0.1);
  border-color: rgba(52, 211, 153, 0.4);
}
.flash-err {
  color: #fca5a5;
  background: rgba(248, 113, 113, 0.1);
  border-color: rgba(248, 113, 113, 0.4);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s var(--ease-out-soft);
}
.modal-enter-active .panel,
.modal-leave-active .panel {
  transition: transform 0.3s var(--ease-out-soft);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .panel,
.modal-leave-to .panel {
  transform: translateY(20px) scale(0.97);
}

.flash-enter-active,
.flash-leave-active {
  transition: opacity 0.2s var(--ease-out-soft);
}
.flash-enter-from,
.flash-leave-to {
  opacity: 0;
}
</style>
