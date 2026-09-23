import type { Env } from '../../_types'
import { json, fail } from '../../_lib/http'
import { getBearer, verifyToken } from '../../_lib/auth'
import { fetchModels, chatCompletions, extractContent } from '../../_lib/llm'
import {
  readLlmSettings,
  writeLlmSettings,
  reconcileApiKey,
  normalizeBaseUrl,
} from '../../_lib/settings'

interface FetchModelsBody {
  providerId?: string
  baseUrl?: string
  apiKey?: string
}

// POST /api/admin/llm —— 抓取模型列表（试连 + 列模型）
// 兼容两种调用方式：
//   1) 传 providerId：用 KV 中已保存的 baseUrl/apiKey，可只传新值覆盖
//   2) 传 baseUrl + apiKey：临时探测（新建未保存渠道时）
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = getBearer(request)
  if (!(await verifyToken(env.EDIT_SECRET, token))) {
    return fail(401, '未授权')
  }

  let body: FetchModelsBody
  try {
    body = (await request.json()) as FetchModelsBody
  } catch {
    return fail(400, '请求体不是合法 JSON')
  }

  const settings = await readLlmSettings(env)
  let baseUrl = normalizeBaseUrl(body.baseUrl || '')
  let apiKey = (body.apiKey || '').trim()

  if (body.providerId) {
    const existing = settings.providers.find((p) => p.id === body.providerId)
    if (!existing) return fail(404, '渠道不存在')
    if (!baseUrl) baseUrl = existing.baseUrl
    apiKey = reconcileApiKey(apiKey, existing.apiKey)
  }

  if (!baseUrl) return fail(400, '缺少 baseUrl')
  if (!apiKey) return fail(400, '缺少 apiKey')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  let result: { models: string[] }
  try {
    result = await fetchModels(baseUrl, apiKey, ctrl.signal)
  } catch (e) {
    return fail(502, '抓取模型失败', (e as Error).message)
  } finally {
    clearTimeout(timer)
  }

  // 如果是已保存的渠道，把抓到的模型清单同步回 KV
  if (body.providerId) {
    const idx = settings.providers.findIndex((p) => p.id === body.providerId)
    if (idx >= 0) {
      const cur = settings.providers[idx]
      const nextModels = result.models
      // 若当前 activeModel 不在新清单里，自动选第一个
      const nextActive =
        cur.activeModel && nextModels.includes(cur.activeModel)
          ? cur.activeModel
          : nextModels[0] || null
      settings.providers[idx] = {
        ...cur,
        models: nextModels,
        activeModel: nextActive,
      }
      await writeLlmSettings(env, settings)
    }
  }

  return json({ models: result.models })
}

// PUT /api/admin/llm —— 测试某模型是否可用（发一条 hello）
interface TestChatBody {
  providerId?: string
  baseUrl?: string
  apiKey?: string
  model?: string
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const token = getBearer(request)
  if (!(await verifyToken(env.EDIT_SECRET, token))) {
    return fail(401, '未授权')
  }
  let body: TestChatBody
  try {
    body = (await request.json()) as TestChatBody
  } catch {
    return fail(400, '请求体不是合法 JSON')
  }
  const model = (body.model || '').trim()
  if (!model) return fail(400, '缺少 model')

  const settings = await readLlmSettings(env)
  let baseUrl = normalizeBaseUrl(body.baseUrl || '')
  let apiKey = (body.apiKey || '').trim()

  if (body.providerId) {
    const existing = settings.providers.find((p) => p.id === body.providerId)
    if (!existing) return fail(404, '渠道不存在')
    if (!baseUrl) baseUrl = existing.baseUrl
    apiKey = reconcileApiKey(apiKey, existing.apiKey)
  }
  if (!baseUrl) return fail(400, '缺少 baseUrl')
  if (!apiKey) return fail(400, '缺少 apiKey')

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30000)
  try {
    const data = await chatCompletions(
      {
        id: '__probe__',
        name: '',
        baseUrl,
        apiKey,
        models: [],
        activeModel: model,
        enabled: true,
        createdAt: 0,
      },
      {
        model,
        messages: [
          { role: 'user', content: '说"OK"两个字，不要其他内容。' },
        ],
        max_tokens: 16,
        temperature: 0,
      },
      ctrl.signal,
    )
    const text = extractContent(data).trim()
    return json({ ok: true, reply: text || '(空回复，但请求成功)' })
  } catch (e) {
    return fail(502, '调用失败', (e as Error).message)
  } finally {
    clearTimeout(timer)
  }
}
