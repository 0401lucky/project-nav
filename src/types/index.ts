export interface Project {
  id: string
  name: string
  url: string
  description?: string
  category: string
  icon?: string
  accentColor?: string
  pinned?: boolean
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
