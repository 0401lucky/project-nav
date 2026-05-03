import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Project } from '@/types'
import { api, ApiCallError } from '@/api/client'

interface ProjectsResp {
  items: Project[]
}

export const useProjectsStore = defineStore('projects', () => {
  const items = ref<Project[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastSyncAt = ref(0)

  const categories = computed(() => {
    const set = new Set<string>()
    for (const p of items.value) if (p.category) set.add(p.category)
    return Array.from(set).sort()
  })

  async function fetchAll() {
    if (loading.value) return
    loading.value = true
    error.value = null
    try {
      const data = await api.get<ProjectsResp>('/api/projects')
      items.value = Array.isArray(data?.items) ? data.items : []
      lastSyncAt.value = Date.now()
    } catch (e) {
      error.value = e instanceof ApiCallError ? e.message : '加载失败'
    } finally {
      loading.value = false
    }
  }

  async function persist() {
    await api.put('/api/projects', { items: items.value }, { auth: true })
    lastSyncAt.value = Date.now()
  }

  async function addOrUpdate(project: Project) {
    const idx = items.value.findIndex((p) => p.id === project.id)
    if (idx >= 0) items.value.splice(idx, 1, project)
    else items.value.push(project)
    await persist()
  }

  async function remove(id: string) {
    items.value = items.value.filter((p) => p.id !== id)
    await persist()
  }

  async function bulkAdd(newOnes: Project[]) {
    const seen = new Set(items.value.map((p) => p.url))
    for (const p of newOnes) {
      if (!seen.has(p.url)) {
        items.value.push(p)
        seen.add(p.url)
      }
    }
    await persist()
  }

  async function incrementVisit(id: string) {
    const target = items.value.find((p) => p.id === id)
    if (target) target.visits = (target.visits || 0) + 1
    try {
      await api.post('/api/visit', { projectId: id })
    } catch {
      /* visit 失败不影响主流程 */
    }
  }

  return {
    items,
    loading,
    error,
    lastSyncAt,
    categories,
    fetchAll,
    persist,
    addOrUpdate,
    remove,
    bulkAdd,
    incrementVisit,
  }
})
