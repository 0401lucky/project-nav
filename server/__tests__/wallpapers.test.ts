import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import sharp from 'sharp'
import type { Settings, Wallpaper } from '../../shared/types.ts'
import { createDb } from '../db.ts'
import { readBuiltinManifest, syncBuiltinWallpapers } from '../lib/builtin-wallpapers.ts'
import type { WallpaperManifest } from '../lib/builtin-wallpapers.ts'
import {
  MAX_UPLOAD_BYTES,
  MAX_WALLPAPER_BYTES,
  orientationOf,
  planTiers,
  writeWallpaperVariants,
} from '../lib/images.ts'
import { PUBLIC_WALLPAPER_DIR } from '../lib/paths.ts'
import { readSettings } from '../lib/settings-store.ts'
import { apiClient, cleanupTempDirs, createApp, json, login, tempDeps } from './helpers.ts'
import type { ApiClient, AppDeps } from './helpers.ts'

after(cleanupTempDirs)

async function png(width: number, height: number, background = '#224466'): Promise<Buffer> {
  return await sharp({ create: { width, height, channels: 3, background } }).png().toBuffer()
}

function imageForm(buffer: Buffer, name = 'wall.png', type = 'image/png'): FormData {
  const form = new FormData()
  form.set('file', new File([new Uint8Array(buffer)], name, { type }))
  return form
}

async function authedTempClient(): Promise<{ api: ApiClient; deps: AppDeps }> {
  const deps = tempDeps()
  return { api: apiClient(deps, await login(deps)), deps }
}

describe('档位规划', () => {
  it('不放大原图，小档取主档一半', () => {
    assert.deepEqual(planTiers(1672), [1672, 836])
    assert.deepEqual(planTiers(941), [941, 471])
  })

  it('超过上限的原图缩到上限再分档', () => {
    assert.deepEqual(planTiers(4000), [2560, 1280])
  })

  it('宽高决定横竖', () => {
    assert.equal(orientationOf(1600, 900), 'landscape')
    assert.equal(orientationOf(900, 1600), 'portrait')
    assert.equal(orientationOf(1000, 1000), 'landscape')
  })
})

describe('writeWallpaperVariants', () => {
  it('产出两档 avif/webp 加一张 lqip，且每档都不超预算', async () => {
    const deps = tempDeps()
    const { files, widths, orientation } = await writeWallpaperVariants(
      await png(1200, 800),
      deps.paths.wallpapersDir,
      'test-1',
    )

    assert.deepEqual(widths, [1200, 600])
    assert.equal(orientation, 'landscape')
    assert.deepEqual(
      files.map((file) => file.name).sort(),
      [
        'test-1-1200.avif',
        'test-1-1200.webp',
        'test-1-600.avif',
        'test-1-600.webp',
        'test-1-lqip.webp',
      ],
    )

    for (const file of files) {
      assert.ok(file.bytes > 0, `${file.name} 不该是空文件`)
      assert.ok(file.bytes <= MAX_WALLPAPER_BYTES, `${file.name} 超过预算`)
      assert.ok(existsSync(join(deps.paths.wallpapersDir, file.name)), `${file.name} 应已落盘`)
    }

    const lqip = await sharp(join(deps.paths.wallpapersDir, 'test-1-lqip.webp')).metadata()
    assert.equal(lqip.width, 32)
  })
})

describe('内置壁纸清单同步', () => {
  const manifest: WallpaperManifest = {
    version: 1,
    wallpapers: [
      { id: 'a-landscape', orientation: 'landscape', pairId: 'a', widths: [1600, 800] },
      { id: 'a-portrait', orientation: 'portrait', pairId: 'a', widths: [900, 450] },
      { id: 'b-landscape', orientation: 'landscape', pairId: 'b', widths: [1600, 800] },
    ],
  }

  it('写入内置行并记录档位宽度', () => {
    const db = createDb(':memory:')
    assert.equal(syncBuiltinWallpapers(db, manifest), 3)

    const rows = db.prepare('SELECT * FROM wallpapers ORDER BY created_at').all() as {
      id: string
      builtin: number
      pair_id: string | null
      widths: string
    }[]

    assert.deepEqual(
      rows.map((row) => row.id),
      ['a-landscape', 'a-portrait', 'b-landscape'],
    )
    assert.ok(rows.every((row) => row.builtin === 1))
    assert.equal(rows[0]!.pair_id, 'a')
    assert.deepEqual(JSON.parse(rows[0]!.widths), [1600, 800])
  })

  it('重复同步不产生重复行，创建顺序也稳定', () => {
    const db = createDb(':memory:')
    syncBuiltinWallpapers(db, manifest)
    const before = db.prepare('SELECT id, created_at FROM wallpapers ORDER BY created_at').all()
    syncBuiltinWallpapers(db, manifest)
    const after = db.prepare('SELECT id, created_at FROM wallpapers ORDER BY created_at').all()

    assert.equal(after.length, 3)
    assert.deepEqual(after, before, 'created_at 只在插入时写，选择器顺序不该每次启动都变')
  })

  it('清单里删掉的内置壁纸会从库里清掉', () => {
    const db = createDb(':memory:')
    syncBuiltinWallpapers(db, manifest)
    syncBuiltinWallpapers(db, { version: 1, wallpapers: [manifest.wallpapers[0]!] })

    const ids = (db.prepare('SELECT id FROM wallpapers').all() as { id: string }[]).map((row) => row.id)
    assert.deepEqual(ids, ['a-landscape'])
  })

  it('没选过壁纸时默认用清单里的第一张', () => {
    const db = createDb(':memory:')
    assert.equal(readSettings(db).wallpaper, '')
    syncBuiltinWallpapers(db, manifest)
    assert.equal(readSettings(db).wallpaper, 'a-landscape')
  })

  it('已经选过壁纸时不覆盖用户的选择', () => {
    const db = createDb(':memory:')
    syncBuiltinWallpapers(db, manifest)
    db.prepare('UPDATE settings SET value = \'"b-landscape"\' WHERE key = ?').run('wallpaper')

    syncBuiltinWallpapers(db, manifest)
    assert.equal(readSettings(db).wallpaper, 'b-landscape')
  })

  it('清单为空时清掉全部内置行且不报错', () => {
    const db = createDb(':memory:')
    syncBuiltinWallpapers(db, manifest)
    assert.equal(syncBuiltinWallpapers(db, { version: 1, wallpapers: [] }), 0)
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM wallpapers').get() as { n: number }).n, 0)
  })

  it('manifest 不存在时返回 null 而不是抛错', () => {
    assert.equal(readBuiltinManifest(['./nowhere-at-all']), null)
  })
})

describe('已提交的内置壁纸产物', () => {
  it('manifest 可读，且每张每档都不超过 300KB', () => {
    const manifest = readBuiltinManifest([PUBLIC_WALLPAPER_DIR])
    assert.ok(manifest, `读不到 ${PUBLIC_WALLPAPER_DIR}/manifest.json，先跑 npm run build:wallpapers`)
    assert.equal(manifest.wallpapers.length, 8, '四组主题，横竖各一张')

    for (const entry of manifest.wallpapers) {
      assert.ok(entry.widths.length >= 1, `${entry.id} 至少要有主档`)
      for (const width of entry.widths) {
        for (const format of ['avif', 'webp'] as const) {
          const file = join(PUBLIC_WALLPAPER_DIR, `${entry.id}-${width}.${format}`)
          assert.ok(existsSync(file), `${file} 不存在`)
          const bytes = statSync(file).size
          assert.ok(
            bytes <= MAX_WALLPAPER_BYTES,
            `${entry.id}-${width}.${format} 是 ${(bytes / 1024).toFixed(0)}KB，超过 300KB`,
          )
        }
      }
      assert.ok(
        existsSync(join(PUBLIC_WALLPAPER_DIR, `${entry.id}-lqip.webp`)),
        `${entry.id} 缺少低清占位`,
      )
    }

    // 横竖必须成对，前端才能按屏幕方向选
    const pairs = new Map<string, number>()
    for (const entry of manifest.wallpapers) {
      const key = entry.pairId ?? entry.id
      pairs.set(key, (pairs.get(key) ?? 0) + 1)
    }
    for (const [pairId, count] of pairs) {
      assert.equal(count, 2, `主题 ${pairId} 应该有横竖两张`)
    }
  })
})

describe('POST /api/wallpapers', () => {
  it('上传合法图片返回 201 与档位宽度', async () => {
    const { api, deps } = await authedTempClient()
    const response = await api.post('/api/wallpapers', imageForm(await png(800, 1200)))

    assert.equal(response.status, 201)
    const wallpaper = await json<Wallpaper>(response)
    assert.equal(wallpaper.builtin, false)
    assert.equal(wallpaper.orientation, 'portrait')
    assert.deepEqual(wallpaper.widths, [800, 400])
    assert.equal(wallpaper.pairId, null, '上传的壁纸没有横竖配对')
    assert.ok(existsSync(join(deps.paths.wallpapersDir, `${wallpaper.id}-800.avif`)))
  })

  it('不支持的 MIME 返回 400', async () => {
    const { api } = await authedTempClient()
    for (const type of ['image/svg+xml', 'text/html', 'application/octet-stream', '']) {
      const response = await api.post(
        '/api/wallpapers',
        imageForm(Buffer.from('<svg/>'), 'x.svg', type),
      )
      assert.equal(response.status, 400, `type=${type || '(空)'}`)
    }
  })

  it('超过 10MB 返回 400', async () => {
    const { api } = await authedTempClient()
    const response = await api.post('/api/wallpapers', imageForm(Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x41)))
    assert.equal(response.status, 400)
  })

  it('声称是图片但无法解码返回 400', async () => {
    const { api } = await authedTempClient()
    const response = await api.post('/api/wallpapers', imageForm(Buffer.from('这不是图片')))
    assert.equal(response.status, 400)
  })

  it('缺少 file 字段或不是 multipart 返回 400', async () => {
    const { api } = await authedTempClient()

    const empty = new FormData()
    empty.set('note', '没有文件')
    assert.equal((await api.post('/api/wallpapers', empty)).status, 400)
    assert.equal((await api.post('/api/wallpapers', { file: 'x' })).status, 400)
  })
})

describe('DELETE /api/wallpapers/:id', () => {
  const builtinManifest: WallpaperManifest = {
    version: 1,
    wallpapers: [
      { id: 'builtin-1', orientation: 'landscape', pairId: 'builtin', widths: [1600, 800] },
    ],
  }

  it('拒绝删除内置壁纸，文件也还在', async () => {
    const { api, deps } = await authedTempClient()
    syncBuiltinWallpapers(deps.db, builtinManifest)

    const response = await api.del('/api/wallpapers/builtin-1')
    assert.equal(response.status, 403)
    assert.ok(
      (await json<{ wallpapers: Wallpaper[] }>(await api.get('/api/bootstrap'))).wallpapers.some(
        (item) => item.id === 'builtin-1',
      ),
      '内置壁纸不该被删掉',
    )
  })

  it('删除上传的壁纸会连文件一起清掉', async () => {
    const { api, deps } = await authedTempClient()
    const created = await json<Wallpaper>(
      await api.post('/api/wallpapers', imageForm(await png(800, 600))),
    )
    const file = join(deps.paths.wallpapersDir, `${created.id}-800.avif`)
    assert.ok(existsSync(file))

    assert.equal((await api.del(`/api/wallpapers/${created.id}`)).status, 204)
    assert.ok(!existsSync(file), '文件应被删除')
    assert.equal((await api.del(`/api/wallpapers/${created.id}`)).status, 404, '重复删除返回 404')
  })

  it('删掉的正好是当前壁纸时清空选择', async () => {
    const { api } = await authedTempClient()
    const created = await json<Wallpaper>(
      await api.post('/api/wallpapers', imageForm(await png(800, 600))),
    )
    await api.patch('/api/settings', { wallpaper: created.id })
    assert.equal((await json<Settings>(await api.get('/api/settings'))).wallpaper, created.id)

    await api.del(`/api/wallpapers/${created.id}`)
    assert.equal(
      (await json<Settings>(await api.get('/api/settings'))).wallpaper,
      '',
      '前端应回落到第一张内置壁纸',
    )
  })

  it('壁纸不存在返回 404', async () => {
    const { api } = await authedTempClient()
    assert.equal((await api.del('/api/wallpapers/nope')).status, 404)
  })
})

describe('壁纸接口的鉴权', () => {
  it('未登录返回 401', async () => {
    const anonymous = createApp(tempDeps())

    assert.equal((await anonymous.request('/api/wallpapers', { method: 'POST' })).status, 401)
    assert.equal((await anonymous.request('/api/wallpapers/x', { method: 'DELETE' })).status, 401)
  })
})
