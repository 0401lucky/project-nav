import { onMounted, onBeforeUnmount } from 'vue'
import { useUiStore } from '@/stores/ui'

export function useCommandPalette() {
  const ui = useUiStore()

  function onKey(e: KeyboardEvent) {
    const isModK =
      (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')
    if (isModK) {
      e.preventDefault()
      ui.togglePalette()
      return
    }
    if (e.key === 'Escape' && ui.paletteOpen) {
      ui.togglePalette(false)
    }
  }

  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
}
