import { onMounted, onBeforeUnmount } from 'vue'
import type { Ref } from 'vue'

interface TiltOptions {
  max?: number
  scale?: number
  perspective?: number
}

export function useTilt(elRef: Ref<HTMLElement | null>, opts: TiltOptions = {}) {
  const max = opts.max ?? 8
  const scale = opts.scale ?? 1.02
  const perspective = opts.perspective ?? 800

  let raf = 0
  let bound: HTMLElement | null = null

  const reduceMotion =
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches

  function onMove(e: MouseEvent) {
    if (!bound || raf) return
    raf = requestAnimationFrame(() => {
      const rect = bound!.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width
      const py = (e.clientY - rect.top) / rect.height
      const rx = (py - 0.5) * -2 * max
      const ry = (px - 0.5) * 2 * max
      bound!.style.transform =
        `perspective(${perspective}px) rotateX(${rx}deg) rotateY(${ry}deg) scale(${scale})`
      bound!.style.setProperty('--tilt-mx', px * 100 + '%')
      bound!.style.setProperty('--tilt-my', py * 100 + '%')
      raf = 0
    })
  }

  function onLeave() {
    if (!bound) return
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    bound.style.transform = ''
    bound.style.removeProperty('--tilt-mx')
    bound.style.removeProperty('--tilt-my')
  }

  onMounted(() => {
    if (reduceMotion) return
    bound = elRef.value
    if (!bound) return
    bound.addEventListener('mousemove', onMove, { passive: true })
    bound.addEventListener('mouseleave', onLeave)
  })

  onBeforeUnmount(() => {
    if (!bound) return
    bound.removeEventListener('mousemove', onMove)
    bound.removeEventListener('mouseleave', onLeave)
    if (raf) cancelAnimationFrame(raf)
  })
}
