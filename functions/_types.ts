import type { Project, HealthSample, HealthSummary } from '../src/types'

export interface Env {
  NAV_KV: KVNamespace
  EDIT_PASSWORD: string
  EDIT_SECRET: string
  OCR_PROVIDER?: string
  OCR_API_KEY?: string
}

export type { Project, HealthSample, HealthSummary }

export const KV_KEYS = {
  projects: 'projects',
  healthSummary: 'health:summary',
  healthHistory: (id: string) => `health:${id}`,
} as const

export const HEALTH_HISTORY_LIMIT = 30
