import { randomUUID } from 'node:crypto'

/**
 * 短随机 ID：UUID 去掉横线后取前 12 位十六进制。
 * 单人站点的数据量下碰撞概率可忽略，且足够短，能直接进 URL 和文件名。
 */
export function newId(): string {
  return randomUUID().replaceAll('-', '').slice(0, 12)
}
