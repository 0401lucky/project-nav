import { onMounted, onBeforeUnmount } from 'vue'
import { useHealthStore } from '@/stores/health'

export function useHealthPolling(intervalMs = 60_000) {
  const health = useHealthStore()
  let timer = 0
  let lastTick = 0

  function tick() {
    if (typeof document !== 'undefined' && document.hidden) return
    if (Date.now() - lastTick < intervalMs - 500) return
    lastTick = Date.now()
    health.fetchAll()
  }

  function schedule() {
    if (timer) return
    timer = window.setInterval(tick, intervalMs)
  }

  function clear() {
    if (!timer) return
    clearInterval(timer)
    timer = 0
  }

  function onVis() {
    if (document.hidden) {
      clear()
    } else {
      tick()
      schedule()
    }
  }

  onMounted(() => {
    health.fetchAll()
    schedule()
    document.addEventListener('visibilitychange', onVis)
  })

  onBeforeUnmount(() => {
    clear()
    document.removeEventListener('visibilitychange', onVis)
  })
}
