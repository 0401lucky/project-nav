import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, setToken } from '@/api/client'
import { useProjectsStore } from '@/stores/projects'

const TOKEN_KEY = 'nav-aurora.token'
const EXPIRES_KEY = 'nav-aurora.token-expires'

interface AuthResp {
  token: string
  expiresAt: number
}

function readPersisted(): { token: string | null; expiresAt: number } {
  try {
    const t = sessionStorage.getItem(TOKEN_KEY)
    const e = Number(sessionStorage.getItem(EXPIRES_KEY) || 0)
    if (t && e > Date.now()) return { token: t, expiresAt: e }
  } catch {
    /* ignore */
  }
  return { token: null, expiresAt: 0 }
}

export const useAuthStore = defineStore('auth', () => {
  const init = readPersisted()
  const token = ref<string | null>(init.token)
  const expiresAt = ref<number>(init.expiresAt)

  const isAuthed = computed(
    () => !!token.value && expiresAt.value > Date.now(),
  )

  async function verify(password: string) {
    const resp = await api.post<AuthResp>('/api/auth', { password })
    token.value = resp.token
    expiresAt.value = resp.expiresAt
    setToken(resp.token)
    try {
      sessionStorage.setItem(EXPIRES_KEY, String(resp.expiresAt))
    } catch {
      /* ignore */
    }
    // 登录后重新拉项目，把 private 卡片捞出来
    try {
      await useProjectsStore().fetchAll()
    } catch {
      /* 拉取失败不影响登录态 */
    }
  }

  function clear() {
    token.value = null
    expiresAt.value = 0
    setToken(null)
    try {
      sessionStorage.removeItem(EXPIRES_KEY)
    } catch {
      /* ignore */
    }
    // 退出后重新拉项目，让 private 卡片消失
    useProjectsStore()
      .fetchAll()
      .catch(() => {
        /* ignore */
      })
  }

  return { token, expiresAt, isAuthed, verify, clear }
})
