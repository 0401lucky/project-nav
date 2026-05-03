import type { Project, HealthSummary, OcrCandidate } from '@/types'

export interface PutProjectsBody {
  items: Project[]
}

export interface AuthVerifyBody {
  password: string
}

export interface AuthVerifyResp {
  token: string
  expiresAt: number
}

export interface HealthResp {
  summaries: Record<string, HealthSummary>
  updatedAt: number
}

export interface HealthCheckBody {
  projectId: string
}

export interface OcrBody {
  image: string
  mime?: string
}

export interface OcrResp {
  candidates: OcrCandidate[]
  raw?: string
}

export interface VisitBody {
  projectId: string
}
