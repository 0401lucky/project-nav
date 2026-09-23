<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'

// 全部用 px 字符串，避免与 CSS 中 calc(... - 50%) 单位混用
const mx = ref('50vw')
const my = ref('50vh')
let raf = 0

function onMove(e: MouseEvent) {
  if (raf) return
  raf = requestAnimationFrame(() => {
    mx.value = e.clientX + 'px'
    my.value = e.clientY + 'px'
    raf = 0
  })
}

onMounted(() => window.addEventListener('mousemove', onMove, { passive: true }))
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onMove)
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div
    class="cursor-glow"
    aria-hidden="true"
    :style="{ '--mx': mx, '--my': my } as Record<string, string>"
  ></div>
</template>
