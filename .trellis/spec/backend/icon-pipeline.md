# 图标管道

> 书签图标从「下载」到「前端换上」的完整契约。改 `server/lib/icons.ts`、`server/lib/ico.ts`、
> `server/lib/scraper.ts` 的图标候选部分，或 `server/routes/bookmarks.ts` 里任何 `icon` 接口前先读。

---

## 1. 范围 / 触发

- 图标涉及外部网络、磁盘文件、数据库标记、前端缓存键四处状态，任何一处顺序错了都会出现
  「预览有图标、保存后没有」或「has_icon=1 但文件不在」这类问题。
- 来源：`09-25-icon-resolution` 任务（线上 27 条缺图标，根因见该任务 `research/production-icon-diagnosis.md`）。

## 2. 签名

`server/lib/icons.ts`：

```ts
type IconResult = { ok: true } | { ok: false; reason: string }

sniffImage(buf: Buffer): 'png' | 'jpeg' | 'gif' | 'webp' | 'avif' | 'ico' | 'svg' | null
encodeIcon(raw: Buffer): Promise<{ ok: true; value: Buffer } | { ok: false; reason: string }>
cacheIcon(db, paths, bookmarkId, sourceUrl): Promise<IconResult>            // 下载一张指定的图
cacheIconFromPage(db, paths, bookmarkId, pageUrl, preferred?): Promise<IconResult>
cacheIconFromBuffer(db, paths, bookmarkId, raw): Promise<IconResult>        // 上传 / 粘贴
refetchMissingIcons(db, paths): Promise<MissingIconReport>                  // 并发 4
scheduleIconCache(...) / scheduleIconBatch(...)                             // setImmediate 后台执行
publicIconSource(url): string | null                                        // Google s2/favicons, sz=128
```

`server/lib/ico.ts`：`decodeIco(buf)` 取尺寸最大且支持的条目；PNG 条目原样返回，32 位 BMP 条目返回 RGBA
（alpha 全 0 时用 AND 掩码）；调色板 BMP 等跳过，全不支持返回 `null`。

HTTP 接口（`/api/bookmarks` 下）：

| 方法 路径 | 执行方式 | 返回 |
| --- | --- | --- |
| `POST /` 带 `iconUrl` | 后台 | `Bookmark`（`hasIcon` 先为 false） |
| `PATCH /:id` 带 `iconUrl` | 后台；`iconUrl: null` 为删图标 | `Bookmark`（`hasIcon: false`） |
| `GET /:id` | 同步 | `Bookmark`，供前端轮询 |
| `POST /:id/icon/refetch` | 同步 | `IconRefreshResponse` |
| `POST /:id/icon/public` | 同步 | `IconRefreshResponse` |
| `PUT /:id/icon`（multipart，字段 `file`） | 同步 | `IconRefreshResponse` |
| `POST /icons/refetch-missing` | 同步，约 1 分钟 | `MissingIconReport` |

## 3. 契约

- `IconRefreshResponse { bookmark: Bookmark; error?: string }`：**失败也是 200**，`error` 为中文短句，
  前端原样显示。失败时 `bookmark` 就是原样，旧图标保留、`has_icon` 不降。
- `MissingIconReport { total; succeeded; failed: { id; title; reason }[] }`。
- 失败原因文案只在服务端生成，前端不自己拼。
- 候选顺序（`cacheIconFromPage`）：`preferred` → 页面声明（apple-touch-icon / icon / shortcut icon，
  按 `sizes` 从大到小）→ og:image / twitter:image → `/favicon.ico`；最多试 4 个。
- 落盘顺序：编码成功 → 确认书签还在 → 写文件 → `setBookmarkHasIcon(true)`（同时刷新 `updated_at`，
  前端图标 URL 以 `updated_at` 为缓存键）。
- 第三方图标服务**只能**出现在 `POST /:id/icon/public` 这条路径里；自动抓取、批量补抓都不访问。

## 4. 校验与错误矩阵

| 条件 | 结果 |
| --- | --- |
| 书签不存在 | 404 `书签不存在` |
| 上传非 multipart / 无 `file` | 400 ValidationError |
| 上传或下载 > 1MB | `图片不能超过 1MB` / `图标超过 1MB` |
| 文件头不是图片（不看 Content-Type / 浏览器 MIME） | `返回的内容不是图片` |
| SVG 含 `<text>` | `图标是带文字的 SVG，服务器无法正确渲染`，试下一个候选 |
| ICO 无可用条目 | `图标是不支持的 ICO 格式` |
| 页面打不开 | 用页面原因（HTTP 状态、超时、域名不存在、Cloudflare 质询） |
| 页面没有声明图标且 favicon 失败 | `站点没有提供图标` |
| 页面声明的图标都失败 | `站点声明的图标不可用：<第一个候选的原因>` |
| 公共服务 404 | `公共服务也没有这个站的图标` |
| 下载途中书签被删 | `书签已被删除`，不写文件 |

## 5. 典型情况

- 正常：页面声明 PNG 图标 → 64px WebP 落盘 → `has_icon=1`。
- 边界：只有 `/favicon.ico`，里面是 32 位 BMP 条目 → 走 `decodeIco` 的 raw 分支，照样成功。
- 失败：linux.do 这类 Cloudflare 质询站 → 自动抓取失败并给出原因，用户可点「从公共服务获取」。

## 6. 必需的测试

- `ico.test.ts`：PNG 条目、32 位 BMP 条目、alpha 全 0 退回 AND 掩码、坏文件返回 null。
- `meta.test.ts`：`href` 在 `rel` 前、无引号、单引号、含单引号的 data URI、`sizes` 排序、`alternate icon`、icon 排在 og:image 前。
- `icons.test.ts`：先落盘再置标记并刷新 `updated_at`、文件头识别（Content-Type 撒谎）、含 `<text>` 的 SVG 被拒、
  首选候选失败退回页面候选、页面打不开 / Cloudflare 质询的原因、补抓只处理缺图标的书签。
- `bookmark-icons.test.ts`：`GET /:id`、重抓成功与失败（失败时 `hasIcon` 不变并带回原因）、上传、批量补抓统计。
  公共服务接口目前没有路由测试，改它时补上。

## 7. 错误与正确写法

### 错误：先置标记再写文件，或直接 UPDATE

```ts
db.prepare('UPDATE bookmarks SET has_icon = 1 WHERE id = ?').run(id)
await writeFile(iconFilePath(paths, id), webp)
```

写文件失败时 `has_icon=1` 却没有文件；直接 UPDATE 不刷新 `updated_at`，前端缓存键不变，看不到新图标。

### 正确

```ts
await writeFile(iconFilePath(paths, bookmarkId), encoded.value)
setBookmarkHasIcon(db, bookmarkId, true) // 一并刷新 updated_at
```

### 错误：信 Content-Type 决定怎么解码

实测有站点响应头写 `image/png`、实际给 ICO，而 sharp 不认 ICO 容器。一律先 `sniffImage`。
