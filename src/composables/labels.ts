// 卡片上「认出是哪个站」用到的纯逻辑：首字色块的取字与色相、同名书签判重、显示用主机名。
// 与 filter.ts 同样的约束：零运行时 import，能被 node:test 直接跑。

import type { Bookmark } from '../types'

/**
 * 首字色块上的字：标题里第一个字母、数字或汉字，转大写。
 * 跳过括号、符号和 emoji——「（codex2）CPA」取 C，而不是「（」。取不到时返回 '?'。
 */
export function initialOf(title: string): string {
  const match = /[\p{L}\p{N}]/u.exec(title)
  if (match === null) return '?'
  // 个别字母转大写后不止一个字符（ß → SS），只要第一个
  return [...match[0].toUpperCase()][0] ?? '?'
}

/**
 * 域名哈希决定色相：同一个站点的兜底色块永远同一个颜色，
 * 一眼能认出是哪个站，而不是随机跳色。
 * 算法不能改：改了线上所有站点的颜色都会跟着变。
 */
export function hueOf(url: string): number {
  let host = url
  try {
    host = new URL(url).hostname
  } catch {
    /* 网址解析不了就用原串，总比没有颜色好 */
  }
  let hash = 0
  for (let i = 0; i < host.length; i += 1) {
    hash = (hash * 31 + host.charCodeAt(i)) % 360
  }
  return hash
}

/** 判重用的标题键：去掉首尾空白、不区分大小写 */
export function titleKey(title: string): string {
  return title.trim().toLowerCase()
}

/** 出现两次及以上的标题键 */
export function findDuplicateTitleKeys(bookmarks: readonly Pick<Bookmark, 'title'>[]): Set<string> {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const bookmark of bookmarks) {
    const key = titleKey(bookmark.title)
    if (seen.has(key)) duplicates.add(key)
    else seen.add(key)
  }
  return duplicates
}

/** 同名书签标题下显示的主机名：去掉开头的 www.；网址解析不了就原样返回 */
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
