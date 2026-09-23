import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MetaResponse } from '../../shared/types.ts'
import { extractMeta, fetchPage, normalizeUrl } from '../lib/scraper.ts'
import { authedClient, createApp, json, withServer } from './helpers.ts'

const SAMPLE_HTML = `<!doctype html>
<html>
  <head>
    <title>纯 <title> 标题</title>
    <meta name="description" content="普通描述 &amp; 转义" />
    <meta property="og:title" content="Open Graph 标题" />
    <meta property="og:description" content="OG 描述" />
    <meta property="og:image" content="/images/og.png" />
    <meta name="twitter:image" content="https://cdn.example.com/twitter.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple.png" />
    <link rel="icon" href="/favicon-32.png" sizes="32x32" />
    <link rel="mask-icon" href="/mask.svg" />
    <script>var a = "</dummy>"</script>
  </head>
</html>`

describe('extractMeta', () => {
  it('从固定 HTML 片段里取出标题与描述', () => {
    const meta = extractMeta(SAMPLE_HTML, 'https://example.com/page')
    assert.equal(meta.title, '纯 <title> 标题')
    assert.equal(meta.description, '普通描述 & 转义', 'HTML 实体应被还原')
    assert.equal(meta.ogTitle, 'Open Graph 标题')
    assert.equal(meta.ogDescription, 'OG 描述')
  })

  it('图标候选解析成绝对地址并按优先级排序', () => {
    const meta = extractMeta(SAMPLE_HTML, 'https://example.com/page')
    const candidates = meta.logoCandidates ?? []

    assert.equal(candidates[0], 'https://example.com/apple.png', 'apple-touch-icon 优先级最高')
    assert.ok(candidates.includes('https://example.com/images/og.png'))
    assert.ok(candidates.includes('https://cdn.example.com/twitter.png'))
    assert.ok(candidates.includes('https://example.com/favicon-32.png'))
    assert.ok(candidates.includes('https://example.com/mask.svg'))
  })

  it('一个 link 都没有时回退到 /favicon.ico', () => {
    const meta = extractMeta('<html><head><title>x</title></head></html>', 'https://a.example.com/x')
    assert.deepEqual(meta.logoCandidates, ['https://a.example.com/favicon.ico'])
  })

  it('不再抽取正文（旧 AI 工作台用的字段已移除）', () => {
    const meta = extractMeta(SAMPLE_HTML, 'https://example.com') as Record<string, unknown>
    assert.equal(meta.bodyText, undefined)
  })
})

describe('normalizeUrl', () => {
  it('裸域名补 https 并去掉结尾斜杠', () => {
    assert.equal(normalizeUrl('github.com'), 'https://github.com')
    assert.equal(normalizeUrl('https://github.com/'), 'https://github.com')
    assert.equal(normalizeUrl('  https://github.com/anthropics  '), 'https://github.com/anthropics')
  })

  it('带协议的写法统一成同一种形态，导入去重才有效', () => {
    assert.equal(normalizeUrl('https://x.com'), normalizeUrl('https://x.com/'))
  })

  it('放行 localhost 与显式写协议的内部主机名', () => {
    // 裸输入一律补 https；要走 http 就显式写协议头
    assert.equal(normalizeUrl('localhost:3000'), 'https://localhost:3000')
    assert.equal(normalizeUrl('http://localhost:3000'), 'http://localhost:3000')
    assert.equal(normalizeUrl('http://nas'), 'http://nas')
  })

  it('拒绝随手输入的伪网址与非 http 协议', () => {
    assert.equal(normalizeUrl('abc'), null)
    assert.equal(normalizeUrl('  '), null)
    assert.equal(normalizeUrl('ftp://example.com'), null)
    assert.equal(normalizeUrl('javascript:alert(1)'), null)
  })
})

describe('fetchPage', () => {
  it('连不上时返回 ok=false 与错误原因，不抛异常', async () => {
    // 1 端口不会有服务在听，连接会立刻被拒
    const page = await fetchPage('http://127.0.0.1:1/')
    assert.equal(page.ok, false)
    assert.ok(page.errorMessage)
    assert.equal(page.finalUrl, 'http://127.0.0.1:1/')
  })

  // 「中文标题」的 GBK 字节
  const GBK_TITLE = Buffer.from('d6d0cec4b1eacce2', 'hex')

  it('按 Content-Type 里的 charset 解码 GBK 页面', async () => {
    await withServer(
      (res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=GBK' })
        res.end(Buffer.concat([Buffer.from('<html><head><title>'), GBK_TITLE, Buffer.from('</title></head></html>')]))
      },
      async (base) => {
        assert.equal((await fetchPage(`${base}/`)).title, '中文标题')
      },
    )
  })

  it('响应头没写 charset 时，按页面里的 <meta http-equiv> 声明解码', async () => {
    await withServer(
      (res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(
          Buffer.concat([
            Buffer.from('<html><head><meta http-equiv="Content-Type" content="text/html; charset=gb2312"><title>'),
            GBK_TITLE,
            Buffer.from('</title></head></html>'),
          ]),
        )
      },
      async (base) => {
        assert.equal((await fetchPage(`${base}/`)).title, '中文标题')
      },
    )
  })

  it('不认识的 charset 退回 UTF-8，不抛异常', async () => {
    await withServer(
      (res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=no-such-charset' })
        res.end('<html><head><title>标题</title></head></html>')
      },
      async (base) => {
        assert.equal((await fetchPage(`${base}/`)).title, '标题')
      },
    )
  })
})

describe('POST /api/meta', () => {
  it('抓取成功时返回标题、描述与图标候选，finalUrl 与存库写法一致', async () => {
    const { api } = await authedClient()
    const html = `<!doctype html><html><head>
      <title>兜底标题</title>
      <meta property="og:title" content="OG 标题" />
      <meta property="og:description" content="OG 描述" />
      <link rel="apple-touch-icon" href="/icon.png" />
    </head></html>`

    await withServer(
      (res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
      },
      async (base) => {
        const meta = await json<MetaResponse>(await api.post('/api/meta', { url: `${base}/` }))
        assert.equal(meta.title, 'OG 标题', 'og:title 优先于 <title>')
        assert.equal(meta.description, 'OG 描述')
        assert.equal(meta.finalUrl, base, '结尾斜杠应被抹平')
        assert.ok(meta.iconCandidates.some((url) => url.endsWith('/icon.png')))
        assert.equal(meta.error, undefined)
      },
    )
  })

  it('抓不到时仍是 200，字段留空并带 error', async () => {
    const { api } = await authedClient()
    const meta = await json<MetaResponse>(await api.post('/api/meta', { url: 'http://127.0.0.1:1/' }))

    assert.equal(meta.iconCandidates.length, 0)
    assert.ok(meta.error, '要能告诉前端「没抓到，请手填」')
    assert.equal(meta.title, undefined)
  })

  it('网址非法返回 400', async () => {
    const { api } = await authedClient()
    assert.equal((await api.post('/api/meta', { url: 'abc' })).status, 400)
  })

  it('未登录返回 401', async () => {
    const { deps } = await authedClient()
    const anonymous = createApp(deps)
    assert.equal((await anonymous.request('/api/meta', { method: 'POST' })).status, 401)
  })
})
