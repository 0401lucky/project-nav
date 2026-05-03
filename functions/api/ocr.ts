import type { Env } from '../_types'
import type { OcrCandidate } from '../../src/types'
import { json, fail } from '../_lib/http'
import { getBearer, verifyToken } from '../_lib/auth'

const PROMPT = `这是一张项目部署平台（如 Cloudflare、Zeabur、Vercel）的控制台截图。请提取所有可见的项目名称及其对应的 URL（例如 xxx.workers.dev、xxx.zeabur.app、xxx.vercel.app、自定义域名等）。
只输出 JSON 数组本身，不要解释，不要 markdown 代码块，不要 \`\`\` 包裹。
格式：[{"name":"项目名","url":"https://完整URL"}]
如果某行没有完整 URL（缺少协议或域名），跳过该行。`

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = getBearer(request)
  if (!(await verifyToken(env.EDIT_SECRET, token))) {
    return fail(401, '未授权')
  }
  if (!env.OCR_PROVIDER || !env.OCR_API_KEY) {
    return fail(503, '后端未配置 OCR_PROVIDER / OCR_API_KEY')
  }

  let body: { image?: string; mime?: string }
  try {
    body = (await request.json()) as { image?: string; mime?: string }
  } catch {
    return fail(400, '请求体不是合法 JSON')
  }
  const image = body.image
  const mime = (body.mime || 'image/png').toLowerCase()
  if (!image) return fail(400, '缺少 image 字段（base64 字符串）')
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(mime)) {
    return fail(400, '不支持的图片格式')
  }

  const provider = env.OCR_PROVIDER.toLowerCase()
  let raw = ''
  try {
    if (provider === 'dashscope') raw = await callDashscope(env, image, mime)
    else if (provider === 'openai') raw = await callOpenAI(env, image, mime)
    else if (provider === 'anthropic') raw = await callAnthropic(env, image, mime)
    else return fail(400, `未知的 OCR_PROVIDER: ${provider}`)
  } catch (e) {
    return fail(502, 'Vision API 调用失败', (e as Error).message)
  }

  const candidates = extractJSON(raw)
  if (!candidates) {
    return json({ candidates: [], raw }, 422)
  }
  return json({ candidates, raw })
}

function extractJSON(text: string): OcrCandidate[] | null {
  const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return null
    const result: OcrCandidate[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const o = item as { name?: unknown; url?: unknown }
      if (typeof o.name !== 'string' || typeof o.url !== 'string') continue
      if (!/^https?:\/\//i.test(o.url)) continue
      result.push({
        name: o.name.trim().slice(0, 80),
        url: o.url.trim().slice(0, 500),
      })
    }
    return result
  } catch {
    return null
  }
}

function toDataUrl(image: string, mime: string): string {
  return image.startsWith('data:') ? image : `data:${mime};base64,${image}`
}

function toBase64Only(image: string): string {
  return image.startsWith('data:') ? image.split(',')[1] || '' : image
}

async function callDashscope(env: Env, image: string, mime: string): Promise<string> {
  const dataUrl = toDataUrl(image, mime)
  const resp = await fetch(
    'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OCR_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen-vl-max',
        input: {
          messages: [
            {
              role: 'user',
              content: [{ image: dataUrl }, { text: PROMPT }],
            },
          ],
        },
        parameters: { result_format: 'message' },
      }),
    },
  )
  if (!resp.ok) {
    const detail = await resp.text()
    throw new Error(`dashscope ${resp.status}: ${detail.slice(0, 200)}`)
  }
  const data = (await resp.json()) as Record<string, any>
  const content = data?.output?.choices?.[0]?.message?.content
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
      .join('\n')
  }
  if (typeof content === 'string') return content
  return data?.output?.text || ''
}

async function callOpenAI(env: Env, image: string, mime: string): Promise<string> {
  const dataUrl = toDataUrl(image, mime)
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OCR_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 1500,
    }),
  })
  if (!resp.ok) {
    const detail = await resp.text()
    throw new Error(`openai ${resp.status}: ${detail.slice(0, 200)}`)
  }
  const data = (await resp.json()) as Record<string, any>
  return data?.choices?.[0]?.message?.content || ''
}

async function callAnthropic(env: Env, image: string, mime: string): Promise<string> {
  const base64 = toBase64Only(image)
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.OCR_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mime, data: base64 },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  })
  if (!resp.ok) {
    const detail = await resp.text()
    throw new Error(`anthropic ${resp.status}: ${detail.slice(0, 200)}`)
  }
  const data = (await resp.json()) as Record<string, any>
  const blocks = data?.content
  if (Array.isArray(blocks)) {
    return blocks
      .map((b: any) => (typeof b?.text === 'string' ? b.text : ''))
      .join('\n')
  }
  return ''
}
