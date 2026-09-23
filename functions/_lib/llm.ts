// OpenAI 兼容协议的 LLM 调用封装
// 适配 DeepSeek / Moonshot / SiliconFlow / OneAPI / NewAPI / 智谱 GLM / Ollama 等
import type { LlmProvider } from './settings'
import { normalizeBaseUrl } from './settings'

export interface FetchModelsResult {
  models: string[]
  raw?: unknown
}

// 抓取模型清单：GET {baseUrl}/models
export async function fetchModels(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<FetchModelsResult> {
  const url = `${normalizeBaseUrl(baseUrl)}/models`
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    signal,
  })
  if (!resp.ok) {
    const detail = await safeText(resp)
    throw new Error(`HTTP ${resp.status}: ${detail.slice(0, 200)}`)
  }
  const data = (await resp.json()) as Record<string, unknown>
  // 兼容多种返回格式：
  // - OpenAI:        { data: [{id: "..."}] }
  // - 部分网关:      { models: [{name: "..."}] }
  // - Ollama:        { models: [{name: "..."}] }
  let models: string[] = []
  if (Array.isArray((data as any).data)) {
    models = ((data as any).data as Array<Record<string, unknown>>)
      .map((m) => (typeof m.id === 'string' ? m.id : ''))
      .filter(Boolean)
  } else if (Array.isArray((data as any).models)) {
    models = ((data as any).models as Array<Record<string, unknown>>)
      .map((m) =>
        typeof m.id === 'string'
          ? m.id
          : typeof m.name === 'string'
            ? (m.name as string)
            : '',
      )
      .filter(Boolean)
  }
  // 去重 + 排序
  models = Array.from(new Set(models)).sort((a, b) => a.localeCompare(b))
  return { models, raw: data }
}

// 调用 OpenAI 兼容的 chat completions
// 支持 vision：messages 中 user 消息 content 可以是 [{type:'text'}, {type:'image_url'}]
export async function chatCompletions(
  provider: LlmProvider,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, any>> {
  const url = `${normalizeBaseUrl(provider.baseUrl)}/chat/completions`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })
  if (!resp.ok) {
    const detail = await safeText(resp)
    throw new Error(`HTTP ${resp.status}: ${detail.slice(0, 200)}`)
  }
  return (await resp.json()) as Record<string, any>
}

// 提取 chat completions 返回中的 assistant 文本
export function extractContent(data: Record<string, any>): string {
  const c = data?.choices?.[0]?.message?.content
  if (typeof c === 'string') return c
  // 极少数兼容服务返回数组
  if (Array.isArray(c)) {
    return c
      .map((x: any) => (typeof x?.text === 'string' ? x.text : ''))
      .join('\n')
  }
  return ''
}

async function safeText(resp: Response): Promise<string> {
  try {
    return await resp.text()
  } catch {
    return ''
  }
}
