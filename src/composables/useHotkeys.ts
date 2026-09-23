// 全局快捷键。只在 App.vue 注册一次；组件自己范围内的按键（比如输入框里的 Esc）
// 由组件用 @keydown 处理，不往这里堆。

import { onBeforeUnmount, onMounted } from 'vue'

export interface HotkeyHandlers {
  /** / 或 Cmd/Ctrl+K */
  focusSearch: () => void
  /** Esc */
  escape: () => void
}

/** 正在输入框里打字时不抢按键，否则「/」会变成无法输入的字符 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

export function useHotkeys(handlers: HotkeyHandlers): void {
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      handlers.escape()
      return
    }

    // Cmd+K / Ctrl+K 在输入框里也要生效，所以不查 isTyping
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      handlers.focusSearch()
      return
    }

    if (event.key === '/' && !isTyping(event.target)) {
      event.preventDefault()
      handlers.focusSearch()
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeydown)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
  })
}
