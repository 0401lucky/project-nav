// 轻量提示。模块级共享一份队列，任何地方 show 一下即可，
// 由 App.vue 里的 Toast.vue 负责渲染。

import { readonly, ref } from 'vue'

export type ToastTone = 'info' | 'error'

/** 提示条上的操作按钮，比如删除后的「撤销」 */
export interface ToastAction {
  label: string
  run: () => void
}

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
  action?: ToastAction
}

const DURATION_MS = 3600

const items = ref<ToastItem[]>([])
let nextId = 1

function push(item: Omit<ToastItem, 'id'>, durationMs: number): number {
  const id = nextId++
  items.value = [...items.value, { id, ...item }]
  setTimeout(() => dismiss(id), durationMs)
  return id
}

function show(message: string, tone: ToastTone = 'info'): number {
  return push({ message, tone }, DURATION_MS)
}

/** 带操作按钮的提示。时长由调用方定：撤销提示要和提交定时器一样长 */
function action(message: string, label: string, run: () => void, durationMs = DURATION_MS): number {
  return push({ message, tone: 'info', action: { label, run } }, durationMs)
}

function dismiss(id: number): void {
  items.value = items.value.filter((item) => item.id !== id)
}

export function useToast() {
  return {
    items: readonly(items),
    show,
    action,
    dismiss,
    error: (message: string) => show(message, 'error'),
  }
}
