import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { HealthSummary } from '@/types'
import { api, ApiCallError } from '@/api/client'

interface HealthResp {
  summaries: Record<string, HealthSummary>
  updatedAt: number
}

interface CheckResp {
  summary: HealthSummary
}

export const useHealthStore = defineStore('health', () => {
  const summaries = ref<Record<string, HealthSummary>>({})
  const updatedAt = ref(0)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAll() {
    if (loading.value) return
    loading.value = true
    error.value = null
    try {
      const data = await api.get<HealthResp>('/api/health')
      summaries.value = data.summaries || {}
      updatedAt.value = data.updatedAt || 0
    } catch (e) {
      error.value = e instanceof ApiCallError ? e.message : '加载失败'
    } finally {
      loading.value = false
    }
  }

  async function checkNow(projectId: string) {
    const resp = await api.post<CheckResp>(
      '/api/health',
      { projectId },
      { auth: true },
    )
    summaries.value = { ...summaries.value, [projectId]: resp.summary }
  }

  function getSummary(id: string): HealthSummary | undefined {
    return summaries.value[id]
  }

  return { summaries, updatedAt, loading, error, fetchAll, checkNow, getSummary }
})
