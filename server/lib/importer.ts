// 把解析器的产物落库。两个导入入口（书签 HTML / 旧站 JSON）共用这一份逻辑。
//
// 规则：
// - 同名分组复用已有分组
// - URL 去重：既看库里已有的，也看本次已经导进来的
// - 分组按需创建：某个分组下的书签全被去重掉时不会留下空分组
// - 整批放在一个事务里，中途失败不留半份数据

import type { ImportResult } from '../../shared/types.ts'
import type { Db, ImportedGroup } from '../types.ts'
import { GROUP_NAME_MAX } from './http.ts'
import type { IconJob } from './icons.ts'
import { transaction } from './query.ts'
import { createBookmark, createGroup, listBookmarkRows, listGroupRows } from './repo.ts'

export interface ApplyImportResult {
  result: ImportResult
  /** 需要异步抓图标的任务，由调用方在响应之后再触发 */
  iconJobs: IconJob[]
}

export function applyImport(db: Db, parsed: readonly ImportedGroup[]): ApplyImportResult {
  return transaction(db, () => {
    const groupIdByName = new Map(listGroupRows(db).map((row) => [row.name, row.id]))
    const seenUrls = new Set(listBookmarkRows(db).map((row) => row.url))

    let groupCount = 0
    let bookmarkCount = 0
    const iconJobs: IconJob[] = []

    for (const group of parsed) {
      let groupId: string | null = null

      for (const item of group.bookmarks) {
        if (seenUrls.has(item.url)) continue

        if (groupId === null) {
          // 解析出来的文件夹名可能很长；不截断的话它会绕过路由的 40 字校验，
          // 之后用户在界面上连保存都做不到
          const name = group.name.slice(0, GROUP_NAME_MAX)
          const existing = groupIdByName.get(name)
          if (existing !== undefined) {
            groupId = existing
          } else {
            groupId = createGroup(db, { name, icon: null }).id
            groupIdByName.set(name, groupId)
            groupCount += 1
          }
        }

        const created = createBookmark(db, {
          groupId,
          title: item.title,
          url: item.url,
          description: item.description ?? null,
        })
        seenUrls.add(item.url)
        bookmarkCount += 1
        iconJobs.push({ id: created.id, url: created.url })
      }
    }

    return { result: { groups: groupCount, bookmarks: bookmarkCount }, iconJobs }
  })
}
