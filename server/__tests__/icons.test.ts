import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import sharp from 'sharp'
import { createDb } from '../db.ts'
import { cacheIcon, deleteIcons, faviconSource, iconFilePath, iconPath } from '../lib/icons.ts'
import type { DataPaths } from '../lib/paths.ts'
import { createBookmark, listGroupRows } from '../lib/repo.ts'
import { withServer } from './helpers.ts'
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
        assert.equal(await cacheIcon(db, paths, bookmarkId, url), true)
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
        assert.equal(await cacheIcon(db, paths, bookmarkId, url), false)
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
        assert.equal(await cacheIcon(db, paths, bookmarkId, url), false)
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
        assert.equal(await cacheIcon(db, paths, bookmarkId, url), false)
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
        assert.equal(await cacheIcon(db, paths, bookmarkId, url), false)
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
        assert.equal(await cacheIcon(db, paths, 'not-exist', url), false)
      },
    )

    assert.ok(!existsSync(iconFilePath(paths, 'not-exist')), '不该留下无主图标')
  })

  it('连不上时返回 false 而不是抛错', async () => {
    const { db, paths } = harness()
    const bookmarkId = addBookmark(db)
    assert.equal(await cacheIcon(db, paths, bookmarkId, 'http://127.0.0.1:1/favicon.ico'), false)
    assert.equal(hasIcon(db, bookmarkId), false)
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
