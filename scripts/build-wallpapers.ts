// 把 assets/wallpapers-src 里的原图转成 public/wallpapers 下的多档壁纸与 manifest.json。
//
// 原图是 image-gen 生成的 PNG（单张约 1.4MB），只留在本地，不进仓库也不进镜像；
// 产物才是要随构建发布的。
//
// 用法：npm run build:wallpapers

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { WallpaperManifest, WallpaperManifestEntry } from '../server/lib/builtin-wallpapers.ts'
import {
  MAX_WALLPAPER_BYTES,
  writeWallpaperVariants,
} from '../server/lib/images.ts'
import { PUBLIC_WALLPAPER_DIR } from '../server/lib/paths.ts'

const SOURCE_DIR = 'assets/wallpapers-src'
/** 源图命名约定：{主题 id}-{orientation}.png，主题 id 里可以含连字符 */
const SOURCE_NAME = /^(.+)-(landscape|portrait)\.png$/i

async function main(): Promise<void> {
  const names = readdirSync(SOURCE_DIR)
    .filter((name) => SOURCE_NAME.test(name))
    .sort()

  if (names.length === 0) {
    throw new Error(`${SOURCE_DIR} 里没有 {主题}-{landscape|portrait}.png 形式的源图`)
  }

  // 整体重建，避免删掉某张源图后留下孤儿产物
  rmSync(PUBLIC_WALLPAPER_DIR, { recursive: true, force: true })
  mkdirSync(PUBLIC_WALLPAPER_DIR, { recursive: true })

  const entries: WallpaperManifestEntry[] = []

  for (const name of names) {
    const match = SOURCE_NAME.exec(name)
    if (match === null) continue
    const pairId = match[1] as string
    const orientation = match[2] as 'landscape' | 'portrait'
    const id = `${pairId}-${orientation}`

    const source = await readFile(join(SOURCE_DIR, name))
    const { files, widths, orientation: actualOrientation } = await writeWallpaperVariants(
      source,
      PUBLIC_WALLPAPER_DIR,
      id,
    )

    if (actualOrientation !== orientation) {
      console.warn(
        `  注意：${name} 文件名写的是 ${orientation}，但图片实际是 ${actualOrientation}，按实际尺寸记录`,
      )
    }

    const largest = Math.max(...files.map((file) => file.bytes))
    const largestAvif = files.find((file) => file.format === 'avif' && file.width === widths[0])

    console.log(
      `${id.padEnd(20)} 档位 ${widths.join(' / ').padEnd(12)} ` +
        `最大 ${(largest / 1024).toFixed(0).padStart(3)}KB ` +
        `(主档 avif ${((largestAvif?.bytes ?? 0) / 1024).toFixed(0)}KB)  ${files.length} 个文件`,
    )

    if (largest > MAX_WALLPAPER_BYTES) {
      throw new Error(
        `${id} 产出超过 ${(MAX_WALLPAPER_BYTES / 1024).toFixed(0)}KB（实际 ${(largest / 1024).toFixed(0)}KB）`,
      )
    }

    entries.push({ id, orientation: actualOrientation, pairId, widths })
  }

  const manifest: WallpaperManifest = { version: 1, wallpapers: entries }
  writeFileSync(
    join(PUBLIC_WALLPAPER_DIR, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )

  console.log(`\n共 ${entries.length} 张壁纸，全部低于 ${(MAX_WALLPAPER_BYTES / 1024).toFixed(0)}KB`)
  console.log(`manifest.json 已写出到 ${PUBLIC_WALLPAPER_DIR}`)
}

await main()
