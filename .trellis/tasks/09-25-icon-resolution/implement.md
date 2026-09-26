# 书签图标解析修复 · 执行计划

1. `server/lib/ico.ts` + 单元测试（PNG 条目、32 位 BMP 条目、alpha 全 0 退回 AND 掩码、坏文件返回 null）→ `npm test`
2. `icons.ts`：文件头识别、ICO 接入、SVG `<text>` 拒绝、返回失败原因、`resolveIcon`、`cacheIconFromBuffer` → 改写两条旧 ICO 测试并补新测试
3. `scraper.ts`：`<link>` 解析与排序、失败原因 → `meta.test.ts` 补用例（href 在前、无引号、单引号、含单引号的 data URI、sizes 排序、alternate icon、icon 排在 og:image 前）
4. 路由与共享类型：重抓、上传、公共服务、批量补抓、`GET /:id` → 路由测试
5. 前端：API、store、BookmarkForm、SettingsPanel → `npm run typecheck`
6. 全量验证：`npm test`、`npm run build`；本地起服务用浏览器实操新增 / 编辑 / 补抓

回滚点：每一步独立可回退；第 4 步之前前端不受影响。
