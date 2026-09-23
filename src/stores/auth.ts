// 登录态。密码错误与锁定的提示都落在这里，登录屏只负责展示。

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ApiError, api } from '@/api/client'

export const useAuthStore = defineStore('auth', () => {
  const loggedIn = ref(false)
  const pending = ref(false)
  const error = ref<string | null>(null)

  /** 429 表示连错被锁，登录屏据此把提示写得更明确 */
  const locked = ref(false)

  const canSubmit = computed(() => !pending.value)

  async function login(password: string): Promise<boolean> {
    pending.value = true
    error.value = null
    locked.value = false
    try {
      await api.login(password)
      loggedIn.value = true
      return true
    } catch (thrown) {
      if (thrown instanceof ApiError) {
        locked.value = thrown.status === 429
        // 429 时服务端把"还需等多久"放在 detail 里，优先给用户看
        error.value = thrown.detail ?? thrown.message
      } else {
        error.value = '无法连接到服务器'
      }
      return false
    } finally {
      pending.value = false
    }
  }

  async function logout(): Promise<void> {
    try {
      await api.logout()
    } finally {
      loggedIn.value = false
      error.value = null
      locked.value = false
    }
  }

  /** 任何请求拿到 401 都调它，整站退回登录屏 */
  function markUnauthorized(): void {
    loggedIn.value = false
  }

  function markLoggedIn(): void {
    loggedIn.value = true
    error.value = null
    locked.value = false
  }

  return { loggedIn, pending, error, locked, canSubmit, login, logout, markUnauthorized, markLoggedIn }
})
