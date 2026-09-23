// 壁纸转码：构建脚本（内置壁纸）与上传接口共用这一份，
// 保证两条来源产出的档位结构、命名和质量策略完全一致。

import { readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import type { WallpaperOrientation } from '../../shared/types.ts'

/** 单档体积上限（prd 硬指标） */
export const MAX_WALLPAPER_BYTES = 300 * 1024
/** 上传原图上限 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
/** 上传允许的 MIME */
export const ALLOWED_UPLOAD_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

export const LQIP_WIDTH = 32

/** 主档宽度上限，超过就缩到这里 */
const FULL_WIDTH_CAP = 2560

/**
 * 质量阶梯：从高往低试，取第一个不超预算的。
 * 实测暗调壁纸 AVIF q85 也只有 58KB，所以起点定得比 design §8 说的 50 高得多，
 * 用同样的预算换更好的画质；遇到细节多的上传图会自动往下降。
 */
const AVIF_QUALITIES = [80, 72, 64, 56, 48, 40]
const WEBP_QUALITIES = [85, 78, 70, 62, 54, 46]

const IMAGE_FORMATS = ['avif', 'webp'] as const
export type ImageFormat = (typeof IMAGE_FORMATS)[number]

export interface WallpaperFile {
  /** 相对 /wallpapers 的文件名 */
  name: string
  width: number
  format: ImageFormat
  bytes: number
}

export interface EncodedWallpaper {
  files: WallpaperFile[]
  widths: number[]
  orientation: WallpaperOrientation
}

/**
 * 档位宽度：主档取原图与上限的较小值，小档取主档一半。
 * 不放大原图（生成图只有 1672 宽，硬做 2560 档等于假分辨率），
 * 所以宽度是每张壁纸的实际属性，库里存下来给前端拼 srcset。
 */
export function planTiers(nativeWidth: number): number[] {
  const full = Math.max(1, Math.min(Math.round(nativeWidth), FULL_WIDTH_CAP))
  const small = Math.max(1, Math.round(full / 2))
  return full === small ? [full] : [full, small]
}

export function orientationOf(width: number, height: number): WallpaperOrientation {
  return width >= height ? 'landscape' : 'portrait'
}

export async function writeWallpaperVariants(
  source: Buffer,
  outDir: string,
  id: string,
): Promise<EncodedWallpaper> {
  // 取按 EXIF 摆正后的尺寸：手机竖拍的照片像素是横着存的
  const { width: nativeWidth, height: nativeHeight } = (await sharp(source).metadata()).autoOrient
  if (nativeWidth === undefined || nativeHeight === undefined) {
    throw new Error('无法读取图片尺寸')
  }

  const widths = planTiers(nativeWidth)
  const files: WallpaperFile[] = []

  for (const width of widths) {
    for (const format of IMAGE_FORMATS) {
      const encoded = await encodeWithinBudget(source, width, format)
      const name = `${id}-${width}.${format}`
      await writeFile(join(outDir, name), encoded)
      files.push({ name, width, format, bytes: encoded.length })
    }
  }

  const lqip = await oriented(source).resize(LQIP_WIDTH).blur(8).webp({ quality: 40 }).toBuffer()
  const lqipName = `${id}-lqip.webp`
  await writeFile(join(outDir, lqipName), lqip)
  files.push({ name: lqipName, width: LQIP_WIDTH, format: 'webp', bytes: lqip.length })

  return { files, widths, orientation: orientationOf(nativeWidth, nativeHeight) }
}

/**
 * 所有转码都从这里进：按 EXIF Orientation 摆正像素。
 * 输出的 avif/webp 不带 EXIF，不摆正的话浏览器也不会再替我们转。
 */
function oriented(source: Buffer): ReturnType<typeof sharp> {
  return sharp(source, { autoOrient: true })
}

/** 按已知档位宽度逐个删文件，不用通配：文件名完全由 id 和宽度决定 */
export async function deleteWallpaperFiles(
  dir: string,
  id: string,
  widths: readonly number[],
): Promise<void> {
  const names = [
    ...widths.flatMap((width) => IMAGE_FORMATS.map((format) => `${id}-${width}.${format}`)),
    `${id}-lqip.webp`,
  ]
  await Promise.all(
    names.map(async (name) => {
      try {
        await unlink(join(dir, name))
      } catch {
        /* 文件本来就不在，忽略 */
      }
    }),
  )
}

/** 找出某个 id 残留在目录里的所有文件，用于清理残缺产物 */
export async function listWallpaperFiles(dir: string, id: string): Promise<string[]> {
  try {
    const names = await readdir(dir)
    return names.filter((name) => name.startsWith(`${id}-`))
  } catch {
    return []
  }
}

/** 从高到低试质量档，返回第一个不超过预算的编码结果 */
async function encodeWithinBudget(
  source: Buffer,
  width: number,
  format: ImageFormat,
): Promise<Buffer> {
  const ladder = format === 'avif' ? AVIF_QUALITIES : WEBP_QUALITIES
  let result: Buffer | null = null

  for (const quality of ladder) {
    result =
      format === 'avif'
        ? await oriented(source).resize(width).avif({ quality, effort: 4 }).toBuffer()
        : await oriented(source).resize(width).webp({ quality }).toBuffer()
    if (result.length <= MAX_WALLPAPER_BYTES) break
  }

  if (result === null) throw new Error('质量阶梯不能为空')
  return result
}
