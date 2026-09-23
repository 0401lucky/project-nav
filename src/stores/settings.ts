import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  AdminSettingsClient,
  LlmProviderClient,
} from '@/types'
import { api, ApiCallError } from '@/api/client'

function newClientId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

// 创建一个空白渠道（用于前端编辑态，未保存前 id 临时）
export function blankProvider(): LlmProviderClient {
  return {
    id: 'tmp_' + newClientId(),
    name: '',
    baseUrl: '',
    apiKey: '',
    models: [],
    activeModel: null,
    enabled: true,
    createdAt: Date.now(),
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const providers = ref<LlmProviderClient[]>([])
  const ocrProviderId = ref<string | null>(null)
  const hasCustomPassword = ref(false)
  const hasEnvPassword = ref(false)
  const hasLegacyOcrEnv = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)
  const loaded = ref(false)

  const ocrProvider = computed(() =>
    ocrProviderId.value
      ? providers.value.find((p) => p.id === ocrProviderId.value) || null
      : null,
  )

  function applyResponse(data: AdminSettingsClient) {
    providers.value = data.llm.providers || []
    ocrProviderId.value = data.llm.ocrProviderId
    hasCustomPassword.value = data.admin.hasCustomPassword
    hasEnvPassword.value = data.admin.hasEnvPassword
    hasLegacyOcrEnv.value = data.env.hasLegacyOcrEnv
    loaded.value = true
  }

  async function load() {
    if (loading.value) return
    loading.value = true
    error.value = null
    try {
      const data = await api.get<AdminSettingsClient>('/api/admin/settings', {
        auth: true,
      })
      applyResponse(data)
    } catch (e) {
      error.value = e instanceof ApiCallError ? e.message : '加载设置失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function save() {
    if (saving.value) return
    saving.value = true
    error.value = null
    try {
      // 提交时把临时 id 去掉（让后端重发）
      const payload = {
        providers: providers.value.map((p) => ({
          ...p,
          id: p.id.startsWith('tmp_') ? '' : p.id,
        })),
        ocrProviderId: ocrProviderId.value,
      }
      const data = await api.put<{ llm: AdminSettingsClient['llm'] }>(
        '/api/admin/settings',
        payload,
        { auth: true },
      )
      providers.value = data.llm.providers
      ocrProviderId.value = data.llm.ocrProviderId
    } catch (e) {
      error.value = e instanceof ApiCallError ? e.message : '保存失败'
      throw e
    } finally {
      saving.value = false
    }
  }

  // 抓取模型清单。providerId 为已保存渠道时同步 KV；否则纯探测
  async function fetchModels(input: {
    providerId?: string
    baseUrl: string
    apiKey: string
  }): Promise<string[]> {
    const isPersisted = !!input.providerId && !input.providerId.startsWith('tmp_')
    const body: Record<string, string> = {
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
    }
    if (isPersisted) body.providerId = input.providerId!
    const resp = await api.post<{ models: string[] }>('/api/admin/llm', body, {
      auth: true,
    })
    return resp.models
  }

  async function testChat(input: {
    providerId?: string
    baseUrl: string
    apiKey: string
    model: string
  }): Promise<string> {
    const isPersisted = !!input.providerId && !input.providerId.startsWith('tmp_')
    const body: Record<string, string> = {
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      model: input.model,
    }
    if (isPersisted) body.providerId = input.providerId!
    const resp = await api.put<{ ok: boolean; reply: string }>(
      '/api/admin/llm',
      body,
      { auth: true },
    )
    return resp.reply
  }

  async function changePassword(
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    await api.post(
      '/api/admin/password',
      { oldPassword, newPassword },
      { auth: true },
    )
    hasCustomPassword.value = true
  }

  async function clearCustomPassword(): Promise<void> {
    await api.del('/api/admin/password', { auth: true })
    hasCustomPassword.value = false
  }

  function addProvider() {
    providers.value.push({ ...blankProvider(), name: '新渠道' })
  }

  function removeProvider(id: string) {
    providers.value = providers.value.filter((p) => p.id !== id)
    if (ocrProviderId.value === id) ocrProviderId.value = null
  }

  return {
    providers,
    ocrProviderId,
    hasCustomPassword,
    hasEnvPassword,
    hasLegacyOcrEnv,
    loading,
    saving,
    error,
    loaded,
    ocrProvider,
    load,
    save,
    fetchModels,
    testChat,
    changePassword,
    clearCustomPassword,
    addProvider,
    removeProvider,
  }
})
