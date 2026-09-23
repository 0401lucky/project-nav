// 轻量提示。模块级共享一份队列，任何地方 show 一下即可，
// 由 App.vue 里的 Toast.vue 负责渲染。

import { readonly, ref } from 'vue'

export type ToastTone = 'info' | 'error'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

const DURATION_MS = 3600

const items = ref<ToastItem[]>([])
let nextId = 1

function show(message: string, tone: ToastTone = 'info'): number {
  const id = nextId++
  items.value = [...items.value, { id, message, tone }]
  setTimeout(() => dismiss(id), DURATION_MS)
  return id
}

function dismiss(id: number): void {
  items.value = items.value.filter((item) => item.id !== id)
}

export function useToast() {
  return {
    items: readonly(items),
    show,
    dismiss,
    error: (message: string) => show(message, 'error'),
  }
}
