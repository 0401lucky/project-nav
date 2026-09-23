import type { Env } from '../../_types'
import { json, fail } from '../../_lib/http'
import { getBearer, verifyToken } from '../../_lib/auth'
import { readLlmSettings, pickOcrProvider } from '../../_lib/settings'
import { chatCompletions, extractContent } from '../../_lib/llm'
import type { LlmProvider } from '../../_lib/settings'
import {
  fetchPage,
  normalizeUrl,
  mapConcurrent,
  type FetchedPage,
} from '../../_lib/scraper'

// AI 工作台输入：
//   mode='url'    单 URL
//   mode='urls'   多 URL（一行一个）
//   mode='prompt' 自然语言（不抓页面）
interface PostBody {
  mode?: 'url' | 'urls' | 'prompt'
  input?: string
}

interface ProjectDraft {
  name: string
  url: string
  description: string
  category: string
  icon: string
  iconUrl?: string // 真实 logo 图片地址（独立于 emoji icon）
  accentColor: string
  source?: 'fetched' | 'inferred'
  warning?: string
}

const MAX_URLS = 12
const ALLOWED_CATEGORIES = [
  'AI',
  '工具',
  '文档',
  '开发',
  '部署',
  '监控',
  '设计',
  '学习',
  '资讯',
  '娱乐',
  '其他',
]
const ALLOWED_COLORS = [
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#6366f1',
  '#fb923c',
]

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const token = getBearer(request)
  if (!(await verifyToken(env.EDIT_SECRET, token))) {
    return fail(401, '未授权')
  }

  let body: PostBody
  try {
    body = (await request.json()) as PostBody
  } catch {
    return fail(400, '请求体不是合法 JSON')
  }
  const mode = body.mode || 'url'
  const input = (body.input || '').trim()
  if (!input) return fail(400, '缺少输入内容')

  const settings = await readLlmSettings(env)
  const provider = pickOcrProvider(settings)
  if (!provider) {
    return fail(
      503,
      'AI 工作台需要配置一个可用的 LLM 渠道',
      '请到「后台管理 → LLM 渠道」添加并启用一个，并将其指定为 OCR 渠道（AI 工作台与之共享）',
    )
  }

  try {
    let drafts: ProjectDraft[] = []
    if (mode === 'prompt') {
      drafts = await analyzeFromPrompt(provider, input)
    } else if (mode === 'urls' || mode === 'url') {
      const urls = parseUrls(input)
      if (urls.length === 0) return fail(400, '没有解析出任何 URL')
      if (urls.length > MAX_URLS) {
        return fail(400, `单次最多 ${MAX_URLS} 个 URL`)
      }
      drafts = await analyzeFromUrls(provider, urls)
    } else {
      return fail(400, `未知 mode: ${mode}`)
    }
    return json({ drafts })
  } catch (e) {
    return fail(502, 'AI 分析失败', (e as Error).message)
  }
}

// ---------------- URL 解析 ----------------

function parseUrls(input: string): string[] {
  const parts = input
    .split(/[\s,，;；\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out: string[] = []
  const seen = new Set<string>()
  for (const p of parts) {
    const u = normalizeUrl(p)
    if (!u) continue
    if (seen.has(u)) continue
    seen.add(u)
    out.push(u)
  }
  return out
}

// ---------------- 加强版 Prompt ----------------

const SYSTEM_RULES = `你是一名严谨的项目导航站编辑助手。任务：把网站元数据精炼为一张高质量的导航卡片。

## 字段规则（必须严格遵守）

### name —— 4 到 12 字的简体中文（知名英文品牌可保留英文，例如 Linear、Vercel、Notion）
- 原则：只写品牌名/产品名，不写描述、不写 slogan、不带"官网/官方/首页"
- 从 og:title 或 title 中提取品牌部分，去除「| 描述」「- 副标题」等冗余
- 例：「Linear · The issue tracking tool you'll enjoy using」→ "Linear"
- 例：「腾讯云 - 产业智变·云启未来 - 腾讯」→ "腾讯云"
- 例：「Cloudflare - The Web Performance & Security Company」→ "Cloudflare"

### description —— 一句话，不超过 30 字
- 必须基于真实抓取到的内容（title / description / og / 正文摘要），严禁编造
- 写"是什么 + 干什么"，不要写营销话术
- 例：Vercel → "前端应用部署与托管平台"
- 例：Sentry → "应用错误监控与性能追踪"
- 抓取失败时输出空字符串 ""

### category —— 必须从下面 11 个里精确选一个，写汉字本身（不带方括号）
- AI：LLM 聊天 / 图像生成 / 语音生成等 AI 产品。例：ChatGPT、Claude、Midjourney、即梦
- 工具：通用提效软件。例：Notion、Figma、Excalidraw、Raycast
- 文档：知识库 / 文档站 / 博客。例：MDN、阮一峰博客、各官方 Docs
- 开发：代码托管 / IDE / API 平台。例：GitHub、JetBrains、Apifox、Postman
- 部署：云平台 / Serverless / PaaS。例：Vercel、Cloudflare、Zeabur、Netlify
- 监控：可观测性 / 状态页 / 日志。例：Sentry、Grafana、UptimeRobot
- 设计：设计资源 / UI 库 / 灵感站。例：Dribbble、shadcn/ui、Behance
- 学习：教程 / 课程 / 在线学习。例：B 站学习区、慕课、Coursera
- 资讯：新闻 / 聚合 / 论坛。例：少数派、V2EX、HackerNews
- 娱乐：流媒体 / 游戏 / 视频。例：Bilibili、YouTube、Steam
- 其他：以上都不贴切再用

### icon —— 一个 emoji（不是图片地址）
- 选能直观代表产品类别或行业的 emoji，避免使用通用 🔗 / 🌐
- AI → 🤖 / 🧠 / ✨
- 部署 / 云 → ☁️ / 🚀
- 设计 → 🎨 / 🖌️
- 监控 → 📊 / 📈 / 🩺
- 文档 → 📚 / 📖 / 📝
- 开发 → 💻 / 🛠️ / 🐙（GitHub 章鱼）
- 学习 → 🎓 / 📺
- 娱乐 → 🎬 / 🎮 / 🎵
- 资讯 → 📰 / 💬

### accentColor —— 必须从下方 8 选 1（直接写 hex）
[#8b5cf6, #06b6d4, #ec4899, #10b981, #f59e0b, #ef4444, #6366f1, #fb923c]
匹配品牌色或类别气质：
- AI / 神秘感 / 紫色品牌 → #8b5cf6 或 #6366f1
- 数据 / 监控 / 青色品牌 → #06b6d4
- 成长 / 自然 / 绿色品牌 → #10b981
- 设计 / 创意 / 粉色品牌 → #ec4899
- 警示 / 红色品牌（YouTube、知乎红） → #ef4444
- 黄色品牌 → #f59e0b
- 橙色品牌（HackerNews、Sketch） → #fb923c

## 输出格式（严格）
- 仅输出 JSON 数组，不要 markdown 代码块，不要解释、不要前后空话
- 数组顺序与输入一致
- 字段名固定为 name / description / category / icon / accentColor`

async function analyzeFromUrls(
  provider: LlmProvider,
  urls: string[],
): Promise<ProjectDraft[]> {
  // 并发抓取（限制 6 路）
  const fetched = await mapConcurrent(urls, 6, fetchPage)

  // 调一次 LLM 把所有页面合在一起分析
  const summaries = fetched.map((f, idx) => formatFetchedForLlm(f, idx))
  const userPrompt = `${SYSTEM_RULES}

## 当前任务
我提供了 ${fetched.length} 个网站的元数据。请为每一个生成一张导航卡片。

## 输入
${summaries.join('\n\n---\n\n')}

## 你的输出（仅 JSON 数组，长度 ${fetched.length}，与输入顺序对应）：`

  const reply = await chatCompletions(provider, {
    model: provider.activeModel,
    messages: [
      {
        role: 'system',
        content: '你是一个只输出严格 JSON 的 API，不会输出多余文字。',
      },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 2500,
  })
  const text = extractContent(reply)
  const parsed = extractJsonArray(text)
  if (!parsed) {
    throw new Error('LLM 返回无法解析为 JSON：' + text.slice(0, 200))
  }

  const drafts: ProjectDraft[] = []
  for (let i = 0; i < fetched.length; i++) {
    const f = fetched[i]
    const ai = parsed[i] || {}
    drafts.push(buildDraft(f.url, ai, f, 'fetched'))
  }
  return drafts
}

function formatFetchedForLlm(f: FetchedPage, idx: number): string {
  if (!f.ok) {
    return `[${idx + 1}] ${f.url}\n[抓取失败] ${f.errorMessage}\n请基于 URL 中的 host 推断品牌名，description 留空。`
  }
  const lines = [
    `[${idx + 1}] ${f.url}`,
    f.finalUrl !== f.url ? `(跳转到 ${f.finalUrl})` : '',
    f.title ? `<title>: ${f.title}` : '',
    f.ogTitle ? `og:title: ${f.ogTitle}` : '',
    f.description ? `meta description: ${f.description}` : '',
    f.ogDescription ? `og:description: ${f.ogDescription}` : '',
    f.bodyText ? `正文摘要(前 600 字): ${f.bodyText.slice(0, 600)}` : '',
  ].filter(Boolean)
  return lines.join('\n')
}

// ---------------- 自然语言模式 ----------------

async function analyzeFromPrompt(
  provider: LlmProvider,
  prompt: string,
): Promise<ProjectDraft[]> {
  const userPrompt = `${SYSTEM_RULES}

## 当前任务
用户用自然语言描述了他想加进导航站的网站。请基于你的常识，输出真实存在的著名站点列表。

## 额外约束
- url 必须是真实存在的著名站点的 https 地址（首页 URL，不要带路径）
- 用户描述模糊或不指向具体站点时，返回空数组 []
- 单次最多 ${MAX_URLS} 项
- 仅返回你确信存在且常用的站点，宁缺勿滥

## 用户描述
${prompt}

## 你的输出（仅 JSON 数组，每项必须包含 url 字段）：`

  const reply = await chatCompletions(provider, {
    model: provider.activeModel,
    messages: [
      {
        role: 'system',
        content: '你是一个只输出严格 JSON 的 API，不会输出多余文字。',
      },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 1800,
  })
  const text = extractContent(reply)
  const parsed = extractJsonArray(text)
  if (!parsed) {
    throw new Error('LLM 返回无法解析为 JSON：' + text.slice(0, 200))
  }
  return parsed
    .slice(0, MAX_URLS)
    .map((ai) => buildDraft((ai as any).url || '', ai, null, 'inferred'))
    .filter((d) => /^https?:\/\//.test(d.url))
}

// ---------------- 通用：解析 LLM 数组输出 ----------------

function extractJsonArray(text: string): Array<Record<string, unknown>> | null {
  // 优先匹配 ```json ... ``` 围栏内
  const fence = text.match(/```(?:json)?\s*([\s\S]+?)```/i)
  const candidate = fence ? fence[1] : text
  const match = candidate.match(/\[[\s\S]*\]/)
  if (!match) return null
  try {
    const v = JSON.parse(match[0])
    if (!Array.isArray(v)) return null
    return v
  } catch {
    return null
  }
}

function buildDraft(
  url: string,
  ai: Record<string, unknown>,
  fetched: FetchedPage | null,
  source: 'fetched' | 'inferred',
): ProjectDraft {
  let host = ''
  try {
    host = new URL(url).host
  } catch {
    /* ignore */
  }
  const fallbackName =
    fetched?.ogTitle ||
    fetched?.title?.replace(/[\s\-|·]+.+$/, '').trim() ||
    host

  const name = pickString(ai.name, fallbackName).slice(0, 40)
  const description = pickString(
    ai.description,
    fetched?.ogDescription || fetched?.description || '',
  ).slice(0, 80)
  const rawCat = pickString(ai.category, '其他')
  const category = ALLOWED_CATEGORIES.includes(rawCat) ? rawCat : '其他'
  const icon = pickString(ai.icon, '🔗').slice(0, 4)
  const rawColor = pickString(ai.accentColor, '#8b5cf6')
  const accentColor = ALLOWED_COLORS.includes(rawColor)
    ? rawColor
    : '#8b5cf6'

  // 优先从已抓取页面拿真实 logo 候选；抓取失败兜底到 host favicon
  let iconUrl: string | undefined
  if (fetched?.logoCandidates && fetched.logoCandidates.length > 0) {
    iconUrl = fetched.logoCandidates[0]
  } else if (host) {
    iconUrl = `https://${host}/favicon.ico`
  }

  const draft: ProjectDraft = {
    name,
    url: pickString((ai as Record<string, unknown>).url, url),
    description,
    category,
    icon,
    iconUrl,
    accentColor,
    source,
  }
  if (fetched && !fetched.ok) draft.warning = '抓取失败：' + (fetched.errorMessage || '')
  return draft
}

function pickString(v: unknown, fb: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fb
}
