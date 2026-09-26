# 书签图标解析修复 · 技术设计

## 总体思路

图标管道保持「下载 → 转成 64px WebP → 落盘 → 置 has_icon=1」不变，改的是三处：

1. **解码层**：进 sharp 之前先按文件头识别格式；ICO 自己拆，含 `<text>` 的 SVG 直接拒绝。
2. **候选层**：`<link>` 改为「先切标签、再逐个解析属性」，排序改成页面声明的图标优先。
3. **入口层**：新增同步的「重抓 / 上传 / 公共服务 / 批量补抓」接口，每个都返回失败原因；前端据此显示结果并刷新卡片。

## 模块边界

| 文件 | 职责 |
| --- | --- |
| `server/lib/ico.ts`（新） | 纯函数 `decodeIco(buf)`：选最大条目；PNG 条目原样返回 PNG 字节，32 位 BMP 条目返回 RGBA 像素（alpha 全 0 时用 AND 掩码）。不认识的格式返回 null。 |
| `server/lib/icons.ts` | `sniffImage(buf)` 按文件头判断类型；`encodeIcon(raw)` 统一转 WebP；`cacheIcon` 改为返回 `IconResult`（`{ ok: true } \| { ok: false, reason }`）；`resolveIcon(db, paths, id, pageUrl, preferred?)` 串起「首选候选 → 页面候选 → /favicon.ico」；`cacheIconFromBuffer` 供上传用；`publicIconSource(url)` 拼 Google 地址。 |
| `server/lib/scraper.ts` | `extractLogoCandidates` 重写 `<link>` 解析；`fetchPage` 失败时给出可读原因（HTTP 状态、超时、域名不存在、Cloudflare 质询）。 |
| `server/routes/bookmarks.ts` | 新增 `GET /:id`、`POST /:id/icon/refetch`、`POST /:id/icon/public`、`PUT /:id/icon`（multipart 上传）、`POST /icons/refetch-missing`。新增书签时首选候选失败会自动退回整页解析。 |
| `shared/types.ts` | 新增 `IconRefreshResponse { bookmark, error? }`、`RefetchMissingResult { total, succeeded, failed: { id, title, reason }[] }`。 |
| `src/api/client.ts` / `src/stores/data.ts` | 对应的 API；store 增加 `refreshIcon`、`replaceBookmark`、`pollIcon`（保存后若 hasIcon 仍为 false，2s/4s/8s 各查一次 `GET /:id`）。 |
| `BookmarkForm.vue` | 新增：默认选中第一个候选。编辑：显示当前图标 + 「重新抓取」「上传图片」「从公共服务获取」三个按钮，支持在面板内 Ctrl+V 粘贴图片；操作立即生效，结果或失败原因显示在图标区下方。 |
| `SettingsPanel.vue` | 新增「补抓缺失图标」一节：按钮 + 结果统计 + 失败清单。 |

## 关键契约

- 失败原因文案统一在服务端生成（中文短句），前端原样显示，避免两边各写一套。
- 同步接口的超时上限：单条最多「页面 8s + 4 个候选 × 8s」，实际几秒；批量接口并发 4，27 条实测预计 1 分钟内。批量期间前端按钮显示进行中，不允许重复点。
- 第三方服务只在 `POST /:id/icon/public` 里访问；自动抓取、批量补抓的代码路径里没有这个地址。
- 上传接口：只收 ≤1MB 的图片，按文件头识别（PNG/JPEG/GIF/WebP/ICO/SVG 不含 text），不看浏览器给的 MIME。
- `has_icon` 语义不变：只有文件确实落盘才置 1。重抓失败时**保留旧图标**，不降回 0。

## ICO 解码细节

- 头：`reserved=0, type=1, count>0`；每个目录项 16 字节，宽高 0 表示 256。
- 条目数据以 `\x89PNG` 开头 → PNG；否则按 BITMAPINFOHEADER 读：只接受 `biBitCount=32`、`biCompression=0`；高度字段是 XOR+AND 两倍；行自底向上、BGRA 排列；AND 掩码每行按 4 字节对齐。
- 不支持的条目（调色板 BMP 等）跳过，退而取下一个最大的；全都不支持返回 null。

## 兼容与回滚

- 无数据库结构变化，无新依赖。回滚即回退代码；已写入的图标文件照常可用。
- 现有测试「ICO 放弃」「只提供 ICO 时放弃」两条的预期会反转，改成「能解出来」。
