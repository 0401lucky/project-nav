import type { Env } from '../../_types'
import { json, fail } from '../../_lib/http'
import { getBearer, verifyToken } from '../../_lib/auth'
import {
  readLlmSettings,
  writeLlmSettings,
  readAdminSettings,
  maskApiKey,
  reconcileApiKey,
  normalizeBaseUrl,
  newProviderId,
  type LlmProvider,
  type LlmSettings,
} from '../../_lib/settings'

// ---------------- GET：读取整体设置（apiKey 脱敏返回） ----------------

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const token = getBearer(request)
  if (!(await verifyToken(env.EDIT_SECRET, token))) {
    return fail(401, '未授权')
  }
  const llm = await readLlmSettings(env)
  const admin = await readAdminSettings(env)

  const safeProviders = llm.providers.map((p) => ({
    ...p,
    apiKey: maskApiKey(p.apiKey),
  }))

  return json({
    llm: {
      providers: safeProviders,
      ocrProviderId: llm.ocrProviderId,
      updatedAt: llm.updatedAt,
    },
    admin: {
      hasCustomPassword: !!(admin.passwordHash && admin.passwordSalt),
      hasEnvPassword: !!env.EDIT_PASSWORD,
      updatedAt: admin.updatedAt,
    },
    env: {
      hasLegacyOcrEnv: !!(env.OCR_PROVIDER && env.OCR_API_KEY),
    },
  })
}

// ---------------- PUT：保存 LLM 设置 ----------------

interface PutBody {
  providers?: Array<Partial<LlmProvider>>
  ocrProviderId?: string | null
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const token = getBearer(request)
  if (!(await verifyToken(env.EDIT_SECRET, token))) {
    return fail(401, '未授权')
  }

  let body: PutBody
  try {
    body = (await request.json()) as PutBody
  } catch {
    return fail(400, '请求体不是合法 JSON')
  }

  const current = await readLlmSettings(env)
  const currentMap = new Map(current.providers.map((p) => [p.id, p]))

  const incoming = Array.isArray(body.providers) ? body.providers : []
  const merged: LlmProvider[] = []
  for (const raw of incoming) {
    if (!raw || typeof raw !== 'object') continue
    const id = typeof raw.id === 'string' && raw.id ? raw.id : newProviderId()
    const existing = currentMap.get(id)
    const name = (typeof raw.name === 'string' ? raw.name : '').trim()
    const baseUrl = normalizeBaseUrl(
      typeof raw.baseUrl === 'string' ? raw.baseUrl : '',
    )
    if (!name || !baseUrl) continue

    merged.push({
      id,
      name: name.slice(0, 40),
      baseUrl,
      apiKey: reconcileApiKey(
        typeof raw.apiKey === 'string' ? raw.apiKey : '',
        existing?.apiKey || '',
      ),
      models: Array.isArray(raw.models)
        ? (raw.models as unknown[])
            .filter((m): m is string => typeof m === 'string')
            .slice(0, 200)
        : existing?.models || [],
      activeModel:
        typeof raw.activeModel === 'string' && raw.activeModel
          ? raw.activeModel
          : existing?.activeModel || null,
      enabled: raw.enabled !== false,
      createdAt:
        typeof raw.createdAt === 'number'
          ? raw.createdAt
          : existing?.createdAt || Date.now(),
    })
  }

  const ocrProviderId =
    typeof body.ocrProviderId === 'string' && body.ocrProviderId
      ? body.ocrProviderId
      : null

  const next: LlmSettings = {
    providers: merged,
    ocrProviderId:
      ocrProviderId && merged.some((p) => p.id === ocrProviderId)
        ? ocrProviderId
        : null,
    updatedAt: Date.now(),
  }
  await writeLlmSettings(env, next)

  // 回读再脱敏返回
  const safe = next.providers.map((p) => ({
    ...p,
    apiKey: maskApiKey(p.apiKey),
  }))
  return json({
    llm: {
      providers: safe,
      ocrProviderId: next.ocrProviderId,
      updatedAt: next.updatedAt,
    },
  })
}
