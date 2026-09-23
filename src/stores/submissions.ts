import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  Submission,
  SubmissionStats,
  Project,
} from '@/types'
import { api, ApiCallError } from '@/api/client'
import { useProjectsStore } from '@/stores/projects'

export const useSubmissionsStore = defineStore('submissions', () => {
  const items = ref<Submission[]>([])
  const stats = ref<SubmissionStats>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  })
  const loading = ref(false)
  const acting = ref(false)
  const error = ref<string | null>(null)

  const pendingCount = computed(() => stats.value.pending)

  async function loadAdminList() {
    if (loading.value) return
    loading.value = true
    error.value = null
    try {
      const data = await api.get<{
        items: Submission[]
        stats: SubmissionStats
      }>('/api/admin/submissions', { auth: true })
      items.value = data.items || []
      stats.value = data.stats || stats.value
    } catch (e) {
      error.value = e instanceof ApiCallError ? e.message : '加载失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  // 仅刷新 stats（不下完整列表，给 EditModeBar 徽章用）
  async function refreshStats() {
    try {
      const data = await api.get<{ stats: SubmissionStats }>(
        '/api/admin/submissions',
        { auth: true },
      )
      if (data.stats) stats.value = data.stats
    } catch {
      /* 静默失败 */
    }
  }

  async function approve(
    id: string,
    edits: Partial<Project> & { private?: boolean },
    note?: string,
  ) {
    if (acting.value) return
    acting.value = true
    error.value = null
    try {
      await api.post(
        '/api/admin/submissions',
        { id, action: 'approve', edits, note },
        { auth: true },
      )
      // 重新拉投稿列表 + 项目列表（让前台立刻看到新卡片）
      await Promise.all([loadAdminList(), useProjectsStore().fetchAll()])
    } catch (e) {
      error.value = e instanceof ApiCallError ? e.message : '通过失败'
      throw e
    } finally {
      acting.value = false
    }
  }

  async function reject(id: string, note?: string) {
    if (acting.value) return
    acting.value = true
    error.value = null
    try {
      await api.post(
        '/api/admin/submissions',
        { id, action: 'reject', note },
        { auth: true },
      )
      await loadAdminList()
    } catch (e) {
      error.value = e instanceof ApiCallError ? e.message : '拒绝失败'
      throw e
    } finally {
      acting.value = false
    }
  }

  async function remove(id: string) {
    if (acting.value) return
    acting.value = true
    error.value = null
    try {
      await api.post(
        '/api/admin/submissions',
        { id, action: 'delete' },
        { auth: true },
      )
      await loadAdminList()
    } catch (e) {
      error.value = e instanceof ApiCallError ? e.message : '删除失败'
      throw e
    } finally {
      acting.value = false
    }
  }

  // 公开提交（不需要登录）
  async function submitPublic(payload: {
    name: string
    url: string
    description?: string
    category?: string
    contact?: string
    reason?: string
    accentColor?: string
    /** 蜜罐字段，前端永远空字符串 */
    website?: string
  }): Promise<{ id: string }> {
    return await api.post<{ id: string }>('/api/submissions', payload)
  }

  return {
    items,
    stats,
    pendingCount,
    loading,
    acting,
    error,
    loadAdminList,
    refreshStats,
    approve,
    reject,
    remove,
    submitPublic,
  }
})
