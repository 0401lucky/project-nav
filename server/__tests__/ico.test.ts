import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import sharp from 'sharp'
import { decodeIco } from '../lib/ico.ts'
import { bmpEntry, buildIco } from './ico-fixtures.ts'

describe('decodeIco', () => {
  it('32 位 BMP 条目：翻转行序、BGRA 转 RGBA', () => {
    // 2×2：左上红、右上绿、左下蓝、右下半透明白
    const rgba = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 128]
    const decoded = decodeIco(buildIco([{ width: 2, height: 2, data: bmpEntry(2, 2, rgba) }]))
    assert.ok(decoded !== null && decoded.kind === 'raw')
    assert.equal(decoded.width, 2)
    assert.deepEqual([...decoded.data], rgba)
  })

  it('alpha 全为 0 时按 AND 掩码决定透明', () => {
    const rgba = [10, 20, 30, 0, 40, 50, 60, 0]
    const decoded = decodeIco(
      buildIco([{ width: 2, height: 1, data: bmpEntry(2, 1, rgba, [true, false]) }]),
    )
    assert.ok(decoded !== null && decoded.kind === 'raw')
    assert.deepEqual([...decoded.data], [10, 20, 30, 0, 40, 50, 60, 255])
  })

  it('PNG 条目原样返回，且取尺寸最大的条目', async () => {
    const png = await sharp({ create: { width: 48, height: 48, channels: 4, background: '#00ff00' } })
      .png()
      .toBuffer()
    const small = bmpEntry(1, 1, [0, 0, 0, 255])
    const decoded = decodeIco(
      buildIco([
        { width: 1, height: 1, data: small },
        { width: 48, height: 48, data: png },
      ]),
    )
    assert.ok(decoded !== null && decoded.kind === 'png')
    assert.ok(decoded.data.equals(png))
  })

  it('不支持的条目跳过，全都不支持时返回 null', () => {
    const paletted = bmpEntry(1, 1, [0, 0, 0, 255])
    paletted.writeUInt16LE(8, 14)
    assert.equal(decodeIco(buildIco([{ width: 1, height: 1, data: paletted }])), null)
    assert.equal(decodeIco(Buffer.from('not an icon')), null)
  })
})
