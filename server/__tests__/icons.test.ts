import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import sharp from 'sharp'
import { createDb } from '../db.ts'
import {
  cacheIcon,
  cacheIconFromBuffer,
  cacheIconFromPage,
  deleteIcons,
  faviconSource,
  ICON_SIZE,
  iconFilePath,
  iconPath,
  refetchMissingIcons,
} from '../lib/icons.ts'
import type { DataPaths } from '../lib/paths.ts'
import { createBookmark, listGroupRows } from '../lib/repo.ts'
import { withServer } from './helpers.ts'
import { solidIco } from './ico-fixtures.ts'
import type { Db } from '../types.ts'

interface Harness {
  db: Db
  paths: DataPaths
  dir: string
}

const cleanups: string[] = []

function harness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'nav-icons-'))
  cleanups.push(dir)
  const paths: DataPaths = {
    root: dir,
    dbFile: join(dir, 'nav.sqlite'),
    iconsDir: join(dir, 'icons'),
    wallpapersDir: join(dir, 'wallpapers'),
  }
  mkdirSync(paths.iconsDir, { recursive: true })
  return { db: createDb(':memory:'), paths, dir }
}

function addBookmark(db: Db): string {
  const groupId = listGroupRows(db)[0]!.id
  return createBookmark(db, {
    groupId,
    title: '示例',
    url: 'https://example.com',
    description: null,
  }).id
}

function hasIcon(db: Db, bookmarkId: string): boolean {
  const row = db.prepare('SELECT has_icon FROM bookmarks WHERE id = ?').get(bookmarkId) as
    | { has_icon: number }
    | undefined
  return row?.has_icon === 1
}

function updatedAtOf(db: Db, bookmarkId: string): number {
  const row = db.prepare('SELECT updated_at FROM bookmarks WHERE id = ?').get(bookmarkId) as
    | { updated_at: number }
    | undefined
  return row?.updated_at ?? 0
}

after(() => {
  for (const dir of cleanups) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
    } catch {
      // Windows 上 libvips 可能还握着刚读过的文件句柄；临时目录清理失败不该让测试挂掉
    }
  }
})

describe('图标路径工具', () => {
  it('faviconSource 取站点根目录的 favicon.ico', () => {
    assert.equal(faviconSource('https://a.example.com/deep/page'), 'https://a.example.com/favicon.ico')
    assert.equal(faviconSource('not a url'), null)
  })

  it('iconPath 与本地文件路径对得上', () => {
    const { paths } = harness()
    assert.equal(iconPath('abc123'), '/icons/abc123.webp')
    assert.equal(iconFilePath(paths, 'abc123'), join(paths.iconsDir, 'abc123.webp'))
  })
})

describe('cacheIcon', () => {
  it('把图下载、转成 64px WebP 落盘，然后才置 has_icon=1', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)
    const source = await sharp({
      create: { width: 512, height: 512, channels: 3, background: '#3366ff' },
    })
      .png()
      .toBuffer()

    await withServer(
      (res) => {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': String(source.length) })
        res.end(source)
      },
      async (url) => {
        assert.equal((await cacheIcon(db, paths, bookmarkId, url)).ok, true)
      },
    )

    assert.ok(existsSync(iconFilePath(paths, bookmarkId)), '图标文件应已落盘')
    assert.equal(hasIcon(db, bookmarkId), true, '成功后才置 1')

    const meta = await sharp(iconFilePath(paths, bookmarkId)).metadata()
    assert.equal(meta.format, 'webp')
    assert.equal(meta.width, 64)
    assert.equal(meta.height, 64)
  })

  it('Content-Type 不是图片时放弃，has_icon 保持 0', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)

    await withServer(
      (res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html>不是图片</html>')
      },
      async (url) => {
        assert.equal((await cacheIcon(db, paths, bookmarkId, url)).ok, false)
      },
    )

    assert.equal(hasIcon(db, bookmarkId), false)
    assert.ok(!existsSync(iconFilePath(paths, bookmarkId)))
  })

  it('返回 404 时放弃', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)

    await withServer(
      (res) => {
        res.writeHead(404)
        res.end()
      },
      async (url) => {
        assert.equal((await cacheIcon(db, paths, bookmarkId, url)).ok, false)
      },
    )

    assert.equal(hasIcon(db, bookmarkId), false)
  })

  it('声称是 image 但内容无法解码时放弃', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)

    await withServer(
      (res) => {
        res.writeHead(200, { 'Content-Type': 'image/png' })
        res.end(Buffer.from('这不是一张 PNG'))
      },
      async (url) => {
        assert.equal((await cacheIcon(db, paths, bookmarkId, url)).ok, false)
      },
    )

    assert.equal(hasIcon(db, bookmarkId), false)
    assert.ok(!existsSync(iconFilePath(paths, bookmarkId)), '解码失败不该留下垃圾文件')
  })

  it('超过 1MB 的图标直接放弃', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)
    const huge = Buffer.alloc(1024 * 1024 + 1, 0x41)

    await withServer(
      (res) => {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': String(huge.length) })
        res.end(huge)
      },
      async (url) => {
        assert.equal((await cacheIcon(db, paths, bookmarkId, url)).ok, false)
      },
    )

    assert.equal(hasIcon(db, bookmarkId), false)
  })

  it('书签在下载途中被删掉就不写文件', async () => {
    const { db, paths } = harness()
    const source = await sharp({
      create: { width: 32, height: 32, channels: 3, background: '#ff0000' },
    })
      .png()
      .toBuffer()

    await withServer(
      (res) => {
        res.writeHead(200, { 'Content-Type': 'image/png' })
        res.end(source)
      },
      async (url) => {
        assert.equal((await cacheIcon(db, paths, 'not-exist', url)).ok, false)
      },
    )

    assert.ok(!existsSync(iconFilePath(paths, 'not-exist')), '不该留下无主图标')
  })

  it('连不上时返回 false 而不是抛错', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)
    assert.equal((await cacheIcon(db, paths, bookmarkId, 'http://127.0.0.1:1/favicon.ico')).ok, false)
    assert.equal(hasIcon(db, bookmarkId), false)
  })

  it('直接给 favicon.ico（32 位 BMP 条目）也能解出来', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)
    const ico = solidIco(32, [0x22, 0x88, 0xee, 255])

    await withServer(
      (res) => {
        res.writeHead(200, { 'Content-Type': 'image/x-icon', 'Content-Length': String(ico.length) })
        res.end(ico)
      },
      async (base) => {
        assert.equal((await cacheIcon(db, paths, bookmarkId, base)).ok, true)
      },
    )

    assert.equal(hasIcon(db, bookmarkId), true)
    assert.ok(existsSync(iconFilePath(paths, bookmarkId)))
  })

  it('图标落盘会刷新 updated_at，前端才能靠它感知图标换了', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)
    const before = updatedAtOf(db, bookmarkId)
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#123456' } })
      .png()
      .toBuffer()

    await new Promise((resolve) => setTimeout(resolve, 5))
    await withServer(
      (res) => {
        res.writeHead(200, { 'Content-Type': 'image/png' })
        res.end(png)
      },
      async (base) => {
        assert.equal((await cacheIcon(db, paths, bookmarkId, base)).ok, true)
      },
    )

    assert.ok(updatedAtOf(db, bookmarkId) > before)
  })
})

describe('cacheIconFromPage', () => {
  it('优先用页面声明的候选，绕开 sharp 解不了的 ICO', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)
    const png = await sharp({
      create: { width: 180, height: 180, channels: 3, background: '#22aa66' },
    })
      .png()
      .toBuffer()
    const ico = solidIco(32, [0x22, 0x88, 0xee, 255])

    await withServer(
      (res, req) => {
        if (req.url === '/apple.png') {
          res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': String(png.length) })
          res.end(png)
          return
        }
        if (req.url === '/favicon.ico') {
          res.writeHead(200, { 'Content-Type': 'image/x-icon', 'Content-Length': String(ico.length) })
          res.end(ico)
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(
          '<html><head><link rel="apple-touch-icon" sizes="180x180" href="/apple.png" />' +
            '<link rel="icon" href="/favicon.ico" /></head></html>',
        )
      },
      async (base) => {
        assert.equal((await cacheIconFromPage(db, paths, bookmarkId, base)).ok, true)
      },
    )

    assert.equal(hasIcon(db, bookmarkId), true)
    const meta = await sharp(iconFilePath(paths, bookmarkId)).metadata()
    assert.equal(meta.format, 'webp')
    assert.equal(meta.width, ICON_SIZE)
  })

  it('页面只提供 ICO 时也能拿到图标', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)
    const ico = solidIco(32, [0x22, 0x88, 0xee, 255])

    await withServer(
      (res, req) => {
        if (req.url === '/favicon.ico') {
          res.writeHead(200, { 'Content-Type': 'image/x-icon', 'Content-Length': String(ico.length) })
          res.end(ico)
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><head><title>没有图标声明</title></head></html>')
      },
      async (base) => {
        assert.equal((await cacheIconFromPage(db, paths, bookmarkId, base)).ok, true)
      },
    )

    assert.equal(hasIcon(db, bookmarkId), true)
    assert.ok(existsSync(iconFilePath(paths, bookmarkId)))
  })

  it('页面抓不到时仍会试站点根目录，覆盖「.ico 其实是 PNG」的站点', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)
    const png = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#8844cc' },
    })
      .png()
      .toBuffer()

    await withServer(
      (res, req) => {
        if (req.url === '/favicon.ico') {
          res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': String(png.length) })
          res.end(png)
          return
        }
        res.writeHead(500)
        res.end()
      },
      async (base) => {
        assert.equal((await cacheIconFromPage(db, paths, bookmarkId, base)).ok, true)
      },
    )

    assert.equal(hasIcon(db, bookmarkId), true)
  })
})

describe('deleteIcons', () => {
  it('删掉已存在的图标文件，对不存在的文件不报错', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)

    await withServer(
      (res) => {
        void sharp({ create: { width: 8, height: 8, channels: 3, background: '#000000' } })
          .png()
          .toBuffer()
          .then((png) => {
            res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': String(png.length) })
            res.end(png)
          })
      },
      async (url) => {
        await cacheIcon(db, paths, bookmarkId, url)
      },
    )
    assert.ok(existsSync(iconFilePath(paths, bookmarkId)))

    await deleteIcons(paths, [bookmarkId, 'never-existed'])
    assert.ok(!existsSync(iconFilePath(paths, bookmarkId)))
  })
})

describe('图标解码与来源', () => {
  it('按文件头识别：Content-Type 写 png、实际给 ICO 也能解', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)
    const ico = solidIco(16, [200, 50, 50, 255])

    await withServer(
      (res) => {
        res.writeHead(200, { 'Content-Type': 'image/png' })
        res.end(ico)
      },
      async (url) => {
        assert.equal((await cacheIcon(db, paths, bookmarkId, url)).ok, true)
      },
    )
    assert.equal(hasIcon(db, bookmarkId), true)
  })

  it('带文字的 SVG 被跳过，并给出原因', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)
    const svg = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='20'>雨</text></svg>"
    const result = await cacheIcon(db, paths, bookmarkId, svg)
    assert.equal(result.ok, false)
    assert.match(result.ok ? '' : result.reason, /文字/)
  })

  it('不含文字的 data URI SVG 能直接落盘', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)
    const svg = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'><rect width='8' height='8' fill='%23f00'/></svg>"
    assert.equal((await cacheIcon(db, paths, bookmarkId, svg)).ok, true)
  })

  it('首选候选失败时退回页面候选', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)
    const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#0a0' } }).png().toBuffer()

    await withServer(
      (res, req) => {
        if (req.url === '/good.png') {
          res.writeHead(200, { 'Content-Type': 'image/png' })
          res.end(png)
          return
        }
        if (req.url === '/') {
          res.writeHead(200, { 'Content-Type': 'text/html' })
          res.end('<link rel="icon" href="/good.png">')
          return
        }
        res.writeHead(404)
        res.end()
      },
      async (base) => {
        const result = await cacheIconFromPage(db, paths, bookmarkId, base + '/', base + '/broken.png')
        assert.equal(result.ok, true)
      },
    )
  })

  it('页面打不开时返回页面的原因', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)
    await withServer(
      (res) => {
        res.writeHead(404)
        res.end()
      },
      async (base) => {
        const result = await cacheIconFromPage(db, paths, bookmarkId, base + '/')
        assert.deepEqual(result, { ok: false, reason: '页面不存在（HTTP 404）' })
      },
    )
  })

  it('Cloudflare 质询被识别出来', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)
    await withServer(
      (res) => {
        res.writeHead(403, { 'cf-mitigated': 'challenge' })
        res.end()
      },
      async (base) => {
        const result = await cacheIconFromPage(db, paths, bookmarkId, base + '/')
        assert.match(result.ok ? '' : result.reason, /Cloudflare/)
      },
    )
  })

  it('上传的图片走同一套转码', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)
    const jpeg = await sharp({ create: { width: 100, height: 50, channels: 3, background: '#123' } }).jpeg().toBuffer()
    assert.equal((await cacheIconFromBuffer(db, paths, bookmarkId, jpeg)).ok, true)
    const meta = await sharp(iconFilePath(paths, bookmarkId)).metadata()
    assert.equal(meta.width, ICON_SIZE)
    assert.equal((await cacheIconFromBuffer(db, paths, bookmarkId, Buffer.from('hi'))).ok, false)
  })

  it('补抓只处理没有图标的书签，并汇总失败原因', async () => {
    const { db, paths } = harness()
    const groupId = listGroupRows(db)[0]!.id
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    await new Promise((resolve) => server.close(resolve))
    const dead = createBookmark(db, { groupId, title: '失效站', url: `http://127.0.0.1:${port}/`, description: null })
    const report = await refetchMissingIcons(db, paths)
    assert.equal(report.total, 1)
    assert.equal(report.succeeded, 0)
    assert.equal(report.failed[0]!.id, dead.id)
    assert.equal(report.failed[0]!.reason, '连接被拒绝')
  })
})
