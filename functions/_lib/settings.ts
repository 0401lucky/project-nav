import type { Env } from '../_types'

// LLM 渠道定义：兼容 OpenAI 协议的第三方服务
export interface LlmProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
  activeModel: string | null
  enabled: boolean
  createdAt: number
}

export interface LlmSettings {
  providers: LlmProvider[]
  ocrProviderId: string | null
  updatedAt: number
}

export interface AdminSettings {
  passwordHash: string | null
  passwordSalt: string | null
  updatedAt: number
}

const KV_LLM = 'settings:llm'
const KV_ADMIN = 'settings:admin'

// ---------------- KV 读写 ----------------

export async function readLlmSettings(env: Env): Promise<LlmSettings> {
  const raw = await env.NAV_KV.get(KV_LLM)
  if (!raw) return { providers: [], ocrProviderId: null, updatedAt: 0 }
  try {
    const obj = JSON.parse(raw) as Partial<LlmSettings>
    const providers = Array.isArray(obj.providers)
      ? (obj.providers as LlmProvider[]).filter(isValidProvider)
      : []
    return {
      providers,
      ocrProviderId:
        typeof obj.ocrProviderId === 'string' && obj.ocrProviderId
          ? obj.ocrProviderId
          : null,
      updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
    }
  } catch {
    return { providers: [], ocrProviderId: null, updatedAt: 0 }
  }
}

export async function writeLlmSettings(env: Env, s: LlmSettings): Promise<void> {
  const body: LlmSettings = { ...s, updatedAt: Date.now() }
  await env.NAV_KV.put(KV_LLM, JSON.stringify(body))
}

export async function readAdminSettings(env: Env): Promise<AdminSettings> {
  const raw = await env.NAV_KV.get(KV_ADMIN)
  if (!raw) return { passwordHash: null, passwordSalt: null, updatedAt: 0 }
  try {
    const obj = JSON.parse(raw) as Partial<AdminSettings>
    return {
      passwordHash:
        typeof obj.passwordHash === 'string' ? obj.passwordHash : null,
      passwordSalt:
        typeof obj.passwordSalt === 'string' ? obj.passwordSalt : null,
      updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
    }
  } catch {
    return { passwordHash: null, passwordSalt: null, updatedAt: 0 }
  }
}

export async function writeAdminSettings(
  env: Env,
  s: AdminSettings,
): Promise<void> {
  const body: AdminSettings = { ...s, updatedAt: Date.now() }
  await env.NAV_KV.put(KV_ADMIN, JSON.stringify(body))
}

// ---------------- 密码哈希（Workers 仅有 SubtleCrypto，故用 SHA-256 + salt） ----------------

export async function hashPassword(
  password: string,
  salt: string,
): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return bufToHex(buf)
}

export function makeSalt(): string {
  const arr = new Uint8Array(16)
  crypto.getRandomValues(arr)
  return bufToHex(arr.buffer)
}

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0')
  }
  return s
}

// 验证密码：KV 中已设置自定义密码则验它，否则回退到 env.EDIT_PASSWORD
export async function verifyAdminPassword(
  env: Env,
  input: string,
): Promise<boolean> {
  const admin = await readAdminSettings(env)
  if (admin.passwordHash && admin.passwordSalt) {
    const candidate = await hashPassword(input, admin.passwordSalt)
    return timingSafeStrEqual(candidate, admin.passwordHash)
  }
  if (env.EDIT_PASSWORD) {
    return timingSafeStrEqual(input, env.EDIT_PASSWORD)
  }
  return false
}

// 仅在「至少有 EDIT_PASSWORD 或 KV 自定义密码」之一时才允许登录
export async function hasAnyPassword(env: Env): Promise<boolean> {
  if (env.EDIT_PASSWORD) return true
  const admin = await readAdminSettings(env)
  return !!(admin.passwordHash && admin.passwordSalt)
}

function timingSafeStrEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let diff = 0
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i]
  return diff === 0
}

// ---------------- 工具：apiKey 脱敏与回填 ----------------

// 脱敏：返回前 4 + **** + 后 4
export function maskApiKey(key: string): string {
  if (!key) return ''
  if (key.length <= 10) return '*'.repeat(key.length)
  return `${key.slice(0, 4)}****${key.slice(-4)}`
}

// 前端保存时若传回脱敏值（含 ****），保留服务端现有原值；否则用新值
export function reconcileApiKey(incoming: string, current: string): string {
  const trimmed = (incoming || '').trim()
  if (!trimmed) return ''
  if (trimmed.includes('****')) return current
  return trimmed
}

// 整理 baseUrl：去尾斜杠
export function normalizeBaseUrl(input: string): string {
  return (input || '').trim().replace(/\/+$/, '')
}

function isValidProvider(p: unknown): p is LlmProvider {
  if (!p || typeof p !== 'object') return false
  const o = p as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.baseUrl === 'string' &&
    typeof o.apiKey === 'string'
  )
}

// 根据 ocrProviderId 找当前激活的 OCR 渠道；没有就返回 null
export function pickOcrProvider(s: LlmSettings): LlmProvider | null {
  if (!s.ocrProviderId) return null
  const p = s.providers.find((x) => x.id === s.ocrProviderId)
  if (!p || !p.enabled) return null
  if (!p.activeModel || !p.apiKey || !p.baseUrl) return null
  return p
}

// 生成 LLM 渠道 id（短随机串，避免依赖 nanoid）
export function newProviderId(): string {
  const arr = new Uint8Array(6)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((b) => b.toString(36))
    .join('')
    .slice(0, 10)
}
