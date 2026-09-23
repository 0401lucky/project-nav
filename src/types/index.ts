export interface Project {
  id: string
  name: string
  url: string
  description?: string
  category: string
  icon?: string
  accentColor?: string
  pinned?: boolean
  /** 仅管理员（编辑模式登录后）可见；公开访问时被服务端过滤 */
  private?: boolean
  createdAt: number
  visits: number
}

export interface HealthSample {
  ts: number
  ok: boolean
  status: number
  latencyMs: number
}

export type HealthState = 'online' | 'degraded' | 'offline' | 'unknown'

export interface HealthSummary {
  status: HealthState
  latencyMs: number
  uptime: number
  lastChecked: number
  samples: HealthSample[]
}

export interface OcrCandidate {
  name: string
  url: string
}

export interface ApiError {
  error: string
  detail?: string
}

// ---------------- 后台管理 ----------------

export interface LlmProviderClient {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
  activeModel: string | null
  enabled: boolean
  createdAt: number
}

export interface AdminSettingsClient {
  llm: {
    providers: LlmProviderClient[]
    ocrProviderId: string | null
    updatedAt: number
  }
  admin: {
    hasCustomPassword: boolean
    hasEnvPassword: boolean
    updatedAt: number
  }
  env: {
    hasLegacyOcrEnv: boolean
  }
}

// ---------------- AI 工作台 ----------------

export interface ProjectDraft {
  name: string
  url: string
  description: string
  category: string
  icon: string
  /** 真实 logo 图片地址（独立于 emoji icon），由后端抓取后回填 */
  iconUrl?: string
  accentColor: string
  source?: 'fetched' | 'inferred'
  warning?: string
}

export type AiMode = 'url' | 'urls' | 'prompt'

// ---------------- 投稿 ----------------

export type SubmissionStatus = 'pending' | 'approved' | 'rejected'

export interface Submission {
  id: string
  name: string
  url: string
  description?: string
  category?: string
  iconUrl?: string
  accentColor?: string
  contact?: string
  reason?: string
  submittedAt: number
  ip?: string // 仅管理员视角可见
  status: SubmissionStatus
  reviewedAt?: number
  reviewNote?: string
}

export interface SubmissionStats {
  total: number
  pending: number
  approved: number
  rejected: number
}
