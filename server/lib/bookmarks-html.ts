// 解析浏览器导出的 Netscape 书签 HTML（Chrome / Edge / Firefox 都是这个格式）。
//
// 结构形如：
//   <DL><p>
//     <DT><H3>书签栏</H3>
//     <DL><p>
//       <DT><H3>子文件夹</H3>
//       <DL><p><DT><A HREF="https://x">标题</A></DL><p>
//     </DL><p>
//   </DL><p>
//
// 按 prd 要求"扁平化一层"：只使用层级最浅的那一批文件夹作为分组，
// 更深的文件夹合并进最近的浅层祖先。这样 Chrome 的三层结构会变成
// 「书签栏 / 其他书签 / 移动设备书签」三个分组，而不是几十个组。

import type { ImportedBookmark, ImportedGroup } from '../types.ts'
import { UNCATEGORIZED_GROUP } from '../types.ts'
import { decodeHtmlEntities, normalizeUrl } from './scraper.ts'

/** <DL>/</DL>/<H3>/<A> 四类 token，按出现顺序遍历 */
const TOKEN_PATTERN = /<DL[^>]*>|<\/DL\s*>|<H3[^>]*>([\s\S]*?)<\/H3\s*>|<A\b([^>]*)>([\s\S]*?)<\/A\s*>/gi

const HREF_PATTERN = /HREF\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i

interface RawBookmark {
  title: string
  url: string
  /** 按层级记录的祖先文件夹名，索引即层级；断层的层级为 undefined */
  folderPath: (string | undefined)[]
}

export function parseBookmarksHtml(html: string): ImportedGroup[] {
  const folders: (string | undefined)[] = []
  const levels = new Set<number>()
  const found: RawBookmark[] = []

  let openDl = 0
  let pendingFolder: string | undefined

  for (const match of html.matchAll(TOKEN_PATTERN)) {
    const token = match[0]

    if (/^<\/DL/i.test(token)) {
      openDl = Math.max(0, openDl - 1)
      folders.length = openDl
      continue
    }

    if (/^<DL/i.test(token)) {
      // 这个 DL 就是 pendingFolder 的容器，它的层级是当前已打开的 DL 数量
      folders.length = openDl
      folders[openDl] = pendingFolder
      if (pendingFolder !== undefined) levels.add(openDl)
      pendingFolder = undefined
      openDl += 1
      continue
    }

    if (match[1] !== undefined) {
      pendingFolder = decodeHtmlEntities(stripTags(match[1])).trim() || undefined
      continue
    }

    if (match[2] !== undefined) {
      const url = extractHref(match[2])
      if (url === null) continue
      found.push({
        // 标题为空时在规范化之后再退回用网址，保证兜底标题与存库的网址写法一致
        title: decodeHtmlEntities(stripTags(match[3] ?? '')).trim(),
        url,
        folderPath: folders.slice(),
      })
    }
  }

  return groupByTopLevelFolder(found, levels)
}

function groupByTopLevelFolder(
  found: readonly RawBookmark[],
  levels: ReadonlySet<number>,
): ImportedGroup[] {
  // 文件里最浅的文件夹层级：Chrome 导出会把所有东西包在一层 <DL> 里，
  // 于是顶层文件夹落在 1 而不是 0，这里不能写死。
  const topLevel = levels.size === 0 ? 0 : Math.min(...levels)

  const groups = new Map<string, ImportedBookmark[]>()
  for (const item of found) {
    // 与写库路径共用 normalizeUrl，否则 https://x.com 与 https://x.com/
    // 会被当成两条不同的书签，去重失效
    const url = normalizeUrl(item.url)
    if (url === null) continue

    const name = item.folderPath[topLevel] ?? UNCATEGORIZED_GROUP
    const bookmark: ImportedBookmark = { title: item.title || url, url }
    const bucket = groups.get(name)
    if (bucket === undefined) {
      groups.set(name, [bookmark])
    } else {
      bucket.push(bookmark)
    }
  }

  return [...groups].map(([name, bookmarks]) => ({ name, bookmarks }))
}

/** 从 <A> 的属性串里取出 HREF，单双引号与无引号都认 */
function extractHref(attributes: string): string | null {
  const match = HREF_PATTERN.exec(attributes)
  if (match === null) return null
  const value = match[2] ?? match[3] ?? match[4] ?? ''
  return decodeHtmlEntities(value).trim() || null
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '')
}
