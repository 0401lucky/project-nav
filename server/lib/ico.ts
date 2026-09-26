// ICO 容器解码。sharp（libvips）不认 ICO，只能自己拆：
// 线上与抽样站点的 .ico 条目只有两种——PNG 条目、32 位 BMP 条目，这里只支持这两种。

export type DecodedIco =
  | { kind: 'png'; data: Buffer }
  | { kind: 'raw'; data: Buffer; width: number; height: number }

interface Entry {
  width: number
  height: number
  offset: number
  size: number
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47])

export function isIco(buf: Buffer): boolean {
  return buf.length >= 6 && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1 && buf.readUInt16LE(4) > 0
}

/** 按尺寸从大到小逐个试，取第一个能解的条目；都解不了返回 null */
export function decodeIco(buf: Buffer): DecodedIco | null {
  if (!isIco(buf)) return null
  const count = buf.readUInt16LE(4)
  const entries: Entry[] = []
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 16
    if (at + 16 > buf.length) break
    const entry = {
      width: buf[at] || 256,
      height: buf[at + 1] || 256,
      size: buf.readUInt32LE(at + 8),
      offset: buf.readUInt32LE(at + 12),
    }
    if (entry.size > 0 && entry.offset + entry.size <= buf.length) entries.push(entry)
  }
  entries.sort((a, b) => b.width * b.height - a.width * a.height)

  for (const entry of entries) {
    const data = buf.subarray(entry.offset, entry.offset + entry.size)
    if (data.subarray(0, 4).equals(PNG_MAGIC)) return { kind: 'png', data: Buffer.from(data) }
    const raw = decodeBmp32(data)
    if (raw !== null) return raw
  }
  return null
}

/** ICO 里的 BMP 条目没有文件头，直接是 BITMAPINFOHEADER；高度字段是像素加掩码两倍高 */
function decodeBmp32(data: Buffer): DecodedIco | null {
  if (data.length < 40) return null
  const headerSize = data.readUInt32LE(0)
  const width = data.readInt32LE(4)
  const height = Math.abs(data.readInt32LE(8)) / 2
  const bitCount = data.readUInt16LE(14)
  const compression = data.readUInt32LE(16)
  if (bitCount !== 32 || compression !== 0 || width <= 0 || height <= 0 || width > 1024) return null

  const pixelBytes = width * height * 4
  const maskStride = Math.ceil(width / 32) * 4
  const pixelsAt = headerSize
  const maskAt = pixelsAt + pixelBytes
  if (maskAt > data.length) return null
  const hasMask = maskAt + maskStride * height <= data.length

  const out = Buffer.alloc(pixelBytes)
  let anyAlpha = false
  // 行自底向上存放，像素顺序 BGRA
  for (let y = 0; y < height; y += 1) {
    const src = pixelsAt + (height - 1 - y) * width * 4
    for (let x = 0; x < width; x += 1) {
      const s = src + x * 4
      const d = (y * width + x) * 4
      out[d] = data[s + 2]
      out[d + 1] = data[s + 1]
      out[d + 2] = data[s]
      out[d + 3] = data[s + 3]
      if (data[s + 3] !== 0) anyAlpha = true
    }
  }

  // 老式图标的 alpha 通道全是 0，透明度写在 AND 掩码里（1 = 透明）
  if (!anyAlpha) {
    for (let y = 0; y < height; y += 1) {
      const row = maskAt + (height - 1 - y) * maskStride
      for (let x = 0; x < width; x += 1) {
        const transparent = hasMask && (data[row + (x >> 3)] >> (7 - (x & 7))) & 1
        out[(y * width + x) * 4 + 3] = transparent ? 0 : 255
      }
    }
  }

  return { kind: 'raw', data: out, width, height }
}
