// 测试用的 ICO 构造器，结构与线上真实文件一致

/** 32 位 BMP 条目：rgba 为自顶向下的像素；mask 为每像素是否透明（仅在 alpha 全 0 时起作用） */
export function bmpEntry(width: number, height: number, rgba: number[], mask?: boolean[]): Buffer {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0)
  header.writeInt32LE(width, 4)
  header.writeInt32LE(height * 2, 8)
  header.writeUInt16LE(1, 12)
  header.writeUInt16LE(32, 14)

  const pixels = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const s = (y * width + x) * 4
      const d = ((height - 1 - y) * width + x) * 4
      pixels[d] = rgba[s + 2]!
      pixels[d + 1] = rgba[s + 1]!
      pixels[d + 2] = rgba[s]!
      pixels[d + 3] = rgba[s + 3]!
    }
  }

  const stride = Math.ceil(width / 32) * 4
  const andMask = Buffer.alloc(stride * height)
  if (mask !== undefined) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (mask[y * width + x]) andMask[(height - 1 - y) * stride + (x >> 3)]! |= 0x80 >> (x & 7)
      }
    }
  }
  return Buffer.concat([header, pixels, andMask])
}

export function buildIco(entries: { width: number; height: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  const dir = Buffer.alloc(16 * entries.length)
  let offset = 6 + dir.length
  entries.forEach((entry, i) => {
    dir[i * 16] = entry.width >= 256 ? 0 : entry.width
    dir[i * 16 + 1] = entry.height >= 256 ? 0 : entry.height
    dir.writeUInt16LE(1, i * 16 + 4)
    dir.writeUInt16LE(32, i * 16 + 6)
    dir.writeUInt32LE(entry.data.length, i * 16 + 8)
    dir.writeUInt32LE(offset, i * 16 + 12)
    offset += entry.data.length
  })
  return Buffer.concat([header, dir, ...entries.map((entry) => entry.data)])
}

/** 纯色 32 位 BMP 的 ICO，最常见的 favicon.ico 形态 */
export function solidIco(size: number, rgba: [number, number, number, number]): Buffer {
  const pixels: number[] = []
  for (let i = 0; i < size * size; i += 1) pixels.push(...rgba)
  return buildIco([{ width: size, height: size, data: bmpEntry(size, size, pixels) }])
}
