<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LlmProviderClient } from '@/types'
import { useSettingsStore } from '@/stores/settings'
import { ApiCallError } from '@/api/client'
import GlassButton from '@/components/ui/GlassButton.vue'

const props = defineProps<{
  provider: LlmProviderClient
  isOcr: boolean
}>()

const emit = defineEmits<{
  (e: 'update', next: LlmProviderClient): void
  (e: 'remove'): void
  (e: 'set-ocr'): void
  (e: 'clear-ocr'): void
  (e: 'flash', kind: 'ok' | 'err', msg: string): void
}>()

const settings = useSettingsStore()

const fetching = ref(false)
const testing = ref(false)
const showKey = ref(false)
const lastTestReply = ref('')

const masked = computed(() => props.provider.apiKey.includes('****'))

function patch(field: keyof LlmProviderClient, value: unknown) {
  emit('update', { ...props.provider, [field]: value })
}

async function onFetchModels() {
  if (fetching.value) return
  if (!props.provider.baseUrl.trim()) {
    emit('flash', 'err', '请先填 Base URL')
    return
  }
  if (!props.provider.apiKey.trim()) {
    emit('flash', 'err', '请先填 API Key')
    return
  }
  fetching.value = true
  try {
    const models = await settings.fetchModels({
      providerId: props.provider.id,
      baseUrl: props.provider.baseUrl,
      apiKey: props.provider.apiKey,
    })
    if (models.length === 0) {
      emit('flash', 'err', '抓到了 0 个模型，检查 Base URL 是否带 /v1')
      return
    }
    const next: LlmProviderClient = {
      ...props.provider,
      models,
      activeModel:
        props.provider.activeModel && models.includes(props.provider.activeModel)
          ? props.provider.activeModel
          : models[0],
    }
    emit('update', next)
    emit('flash', 'ok', `抓到 ${models.length} 个模型`)
  } catch (e) {
    emit(
      'flash',
      'err',
      e instanceof ApiCallError ? e.message + (e.payload.detail ? '：' + e.payload.detail : '') : '抓取失败',
    )
  } finally {
    fetching.value = false
  }
}

async function onTestChat() {
  if (testing.value) return
  if (!props.provider.activeModel) {
    emit('flash', 'err', '请先选择一个模型')
    return
  }
  testing.value = true
  lastTestReply.value = ''
  try {
    const reply = await settings.testChat({
      providerId: props.provider.id,
      baseUrl: props.provider.baseUrl,
      apiKey: props.provider.apiKey,
      model: props.provider.activeModel,
    })
    lastTestReply.value = reply
    emit('flash', 'ok', '调用成功')
  } catch (e) {
    emit(
      'flash',
      'err',
      e instanceof ApiCallError ? e.message + (e.payload.detail ? '：' + e.payload.detail : '') : '调用失败',
    )
  } finally {
    testing.value = false
  }
}

function clearKey() {
  emit('update', { ...props.provider, apiKey: '' })
  showKey.value = true
}
</script>

<template>
  <div class="card" :class="{ disabled: !provider.enabled }">
    <header class="card-head">
      <div class="head-left">
        <input
          :value="provider.name"
          class="name-input"
          placeholder="渠道名称（如 DeepSeek）"
          @input="patch('name', ($event.target as HTMLInputElement).value)"
        />
        <span v-if="isOcr" class="tag-ocr">OCR 当前使用</span>
      </div>
      <div class="head-right">
        <label class="switch">
          <input
            type="checkbox"
            :checked="provider.enabled"
            @change="patch('enabled', ($event.target as HTMLInputElement).checked)"
          />
          <span class="slider"></span>
        </label>
        <button class="icon-btn danger" type="button" aria-label="删除" @click="emit('remove')">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M3 5h10M6.5 5V3.5h3V5M5 5l1 8h4l1-8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </header>

    <div class="grid">
      <label class="field">
        <span class="label">Base URL</span>
        <input
          :value="provider.baseUrl"
          class="input"
          placeholder="https://api.deepseek.com/v1"
          @input="patch('baseUrl', ($event.target as HTMLInputElement).value)"
        />
        <span class="hint">兼容 OpenAI /v1 协议的入口（结尾 /v1，不带斜杠）</span>
      </label>

      <label class="field">
        <span class="label">API Key</span>
        <div class="key-row">
          <input
            :value="provider.apiKey"
            class="input"
            :type="showKey ? 'text' : 'password'"
            placeholder="sk-..."
            autocomplete="off"
            @input="patch('apiKey', ($event.target as HTMLInputElement).value)"
          />
          <button class="icon-btn" type="button" :title="showKey ? '隐藏' : '显示'" @click="showKey = !showKey">
            <svg v-if="showKey" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M2 8s2.5-4.5 6-4.5S14 8 14 8s-2.5 4.5-6 4.5S2 8 2 8z"/>
              <circle cx="8" cy="8" r="2"/>
            </svg>
            <svg v-else viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M2 2l12 12M6 6.5a2 2 0 002.5 2.5M3.5 4.5C2.4 5.6 2 8 2 8s2.5 4.5 6 4.5c1.2 0 2.2-.3 3-.8M9 4c2.5.4 4.5 4 4.5 4s-.3.6-1 1.5"/>
            </svg>
          </button>
          <button v-if="masked" class="icon-btn" type="button" title="清空重输" @click="clearKey">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M3 3l10 10M13 3L3 13"/>
            </svg>
          </button>
        </div>
        <span class="hint">{{ masked ? '当前显示为脱敏值，留空或不改即保留原 Key' : '保存后会脱敏显示' }}</span>
      </label>
    </div>

    <div class="action-row">
      <GlassButton size="sm" :disabled="fetching" @click="onFetchModels">
        <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" :class="{ spin: fetching }">
          <path d="M14 8a6 6 0 11-2-4.5"/>
          <path d="M14 2v3.5h-3.5"/>
        </svg>
        {{ fetching ? '抓取中…' : '抓取模型列表' }}
      </GlassButton>

      <select
        :value="provider.activeModel || ''"
        class="select"
        :disabled="provider.models.length === 0"
        @change="patch('activeModel', ($event.target as HTMLSelectElement).value || null)"
      >
        <option value="" disabled>{{ provider.models.length === 0 ? '尚未抓取模型' : '选择一个模型' }}</option>
        <option v-for="m in provider.models" :key="m" :value="m">{{ m }}</option>
      </select>

      <GlassButton size="sm" variant="ghost" :disabled="testing || !provider.activeModel" @click="onTestChat">
        {{ testing ? '测试中…' : '试调用' }}
      </GlassButton>
    </div>

    <div v-if="lastTestReply" class="reply">
      <span class="reply-label">回复：</span>
      <span class="reply-text">{{ lastTestReply }}</span>
    </div>

    <div class="ocr-row">
      <button
        v-if="!isOcr"
        type="button"
        class="ocr-btn"
        :disabled="!provider.enabled || !provider.activeModel"
        @click="emit('set-ocr')"
      >
        设为 OCR 渠道
      </button>
      <div v-else class="ocr-active">
        <span>该渠道当前用于截图 OCR</span>
        <button type="button" class="ocr-clear" @click="emit('clear-ocr')">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  padding: var(--space-4);
  border-radius: var(--radius-lg);
  display: grid;
  gap: var(--space-3);
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  box-shadow: 0 1px 2px rgba(17, 24, 39, 0.03);
  transition: opacity 0.2s var(--ease-out-soft), border-color 0.15s var(--ease-out-soft);
}
.card:hover {
  border-color: var(--line-strong);
}
.card.disabled {
  opacity: 0.55;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.head-left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
}
.name-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  padding: 4px 0;
}
.name-input:focus {
  outline: none;
  background: var(--bg-sunken);
  padding: 4px 8px;
  border-radius: 6px;
}
.tag-ocr {
  font-size: 10.5px;
  padding: 2px 8px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--aurora-1), var(--aurora-2));
  color: #fff;
  font-weight: 600;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.head-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.switch {
  position: relative;
  display: inline-block;
  width: 32px;
  height: 18px;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: absolute;
  inset: 0;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: 18px;
  cursor: pointer;
  transition: background 0.2s;
}
.slider::before {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  left: 2px;
  top: 2px;
  background: var(--text-muted);
  border-radius: 50%;
  transition: all 0.2s var(--ease-out-soft);
}
.switch input:checked + .slider {
  background: linear-gradient(135deg, var(--aurora-1), var(--aurora-3));
  border-color: transparent;
}
.switch input:checked + .slider::before {
  background: #fff;
  transform: translateX(14px);
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s var(--ease-out-soft);
}
.icon-btn:hover {
  color: var(--text-primary);
  background: var(--bg-elevated);
  border-color: var(--line-strong);
}
.icon-btn.danger:hover {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.08);
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}
@media (max-width: 600px) {
  .grid {
    grid-template-columns: 1fr;
  }
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
.input,
.select {
  height: 36px;
  padding: 0 var(--space-3);
  background: var(--bg-sunken);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-primary);
  font-family: inherit;
  width: 100%;
  transition: border-color 0.15s var(--ease-out-soft), box-shadow 0.15s var(--ease-out-soft);
}
.input:focus,
.select:focus {
  outline: none;
  border-color: var(--line-accent);
  background: var(--bg-elevated);
  box-shadow: 0 0 0 3px rgba(207, 69, 32, 0.12);
}

.select option {
  background: var(--bg-elevated);
  color: var(--text-primary);
  padding: 6px 8px;
}
.select option:disabled {
  color: var(--text-muted);
}
.hint {
  font-size: 10.5px;
  color: var(--text-muted);
  line-height: 1.5;
}

.key-row {
  display: flex;
  gap: 6px;
  align-items: center;
}
.key-row .input {
  flex: 1;
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
}
.key-row .icon-btn {
  flex-shrink: 0;
}

.action-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-2);
  align-items: center;
}
@media (max-width: 600px) {
  .action-row {
    grid-template-columns: 1fr;
  }
}

.spin {
  animation: card-spin 1s linear infinite;
}
@keyframes card-spin {
  to {
    transform: rotate(360deg);
  }
}

.reply {
  padding: var(--space-2) var(--space-3);
  background: rgba(6, 182, 212, 0.06);
  border: 1px solid rgba(6, 182, 212, 0.25);
  border-radius: var(--radius-md);
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.reply-label {
  color: var(--aurora-2);
  font-weight: 600;
  margin-right: 4px;
}

.ocr-row {
  display: flex;
  justify-content: flex-end;
}
.ocr-btn {
  background: transparent;
  border: 1px dashed var(--line-strong);
  color: var(--text-muted);
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s var(--ease-out-soft);
}
.ocr-btn:hover:not(:disabled) {
  border-color: var(--line-accent);
  color: var(--text-primary);
  background: var(--bg-sunken);
}
.ocr-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ocr-active {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 12px;
  color: var(--aurora-1);
}
.ocr-clear {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--text-muted);
  padding: 2px 10px;
  border-radius: var(--radius-full);
  font-size: 11.5px;
  cursor: pointer;
}
.ocr-clear:hover {
  color: var(--text-primary);
  border-color: var(--line-strong);
}
</style>
