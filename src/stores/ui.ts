import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useProjectsStore } from './projects'
import type { Project } from '@/types'

export type EditorTarget =
  | { kind: 'add' }
  | { kind: 'edit'; projectId: string }
  | null

export const useUiStore = defineStore('ui', () => {
  const searchKeyword = ref('')
  const activeCategory = ref<string | null>(null)
  const editMode = ref(false)
  const paletteOpen = ref(false)
  const editorTarget = ref<EditorTarget>(null)
  const screenshotOpen = ref(false)
  const passwordOpen = ref(false)

  const projects = useProjectsStore()

  const filteredProjects = computed<Project[]>(() => {
    const kw = searchKeyword.value.trim().toLowerCase()
    const cat = activeCategory.value
    let list = projects.items.slice()
    if (cat) list = list.filter((p) => p.category === cat)
    if (kw) {
      list = list.filter((p) =>
        (p.name + ' ' + (p.description || '') + ' ' + p.category)
          .toLowerCase()
          .includes(kw),
      )
    }
    return list.sort((a, b) => {
      if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) {
        return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
      }
      if (b.visits !== a.visits) return b.visits - a.visits
      return b.createdAt - a.createdAt
    })
  })

  function openAdd() {
    editorTarget.value = { kind: 'add' }
  }
  function openEdit(projectId: string) {
    editorTarget.value = { kind: 'edit', projectId }
  }
  function closeEditor() {
    editorTarget.value = null
  }

  function togglePalette(force?: boolean) {
    paletteOpen.value = force ?? !paletteOpen.value
  }

  return {
    searchKeyword,
    activeCategory,
    editMode,
    paletteOpen,
    editorTarget,
    screenshotOpen,
    passwordOpen,
    filteredProjects,
    openAdd,
    openEdit,
    closeEditor,
    togglePalette,
  }
})
