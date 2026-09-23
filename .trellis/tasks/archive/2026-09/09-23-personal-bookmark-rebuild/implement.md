# 实施计划：个人书签导航站

对应 `prd.md` 与 `design.md`。按阶段推进，每阶段末尾有验证命令和回滚点。新会话接手时：先读三份文档，再执行 `python ./.trellis/scripts/task.py start`，然后从阶段 0 开始。

## 前置约定

- **分支**：在 `main` 上新建分支 `rebuild/personal-bookmark`，旧代码删除前先在该分支提交一次"删除前快照"。回滚 = 切回 `main`。
- **提交粒度**：每个阶段结束提交一次，提交信息用简体中文，末尾加 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`。
- **测试先行**：后端每个路由先写 `node:test` 用例再写实现；前端 composable 同理。
- **不做的事**：不引入 vitest、vue-router、任何 UI/拖拽/动画库；不保留旧 `functions/`。
- **数据目录**：本地开发 `DATA_DIR=./data`，已加入 `.gitignore`。

## 阶段 0：清场与骨架

- [ ] 0.1 新建分支，提交当前工作区快照（含所有未提交改动）→ 验证：`git log --oneline -1`
- [ ] 0.2 删除 `functions/`、`wrangler.toml`、`wrangler-dev.*.log`、旧 `src/`、`public/favicon.svg`、`dist/`、`tsconfig.node.tsbuildinfo` 等构建残留；保留 `.trellis/`、`.claude/`、`AGENTS.md`、`README.md`（后续重写）
- [ ] 0.3 先把旧 `functions/_lib/scraper.ts` 拷到 `server/lib/scraper.ts`（去掉 `bodyText`、`SUMMARY_TEXT_LIMIT`、UA 改名）再删旧目录
- [ ] 0.4 重写 `package.json`：依赖 `hono`、`@hono/node-server`、`sharp`、`vue`、`pinia`；开发依赖 `vite`、`@vitejs/plugin-vue`、`vue-tsc`、`typescript`、`tsx`、`@types/node`、`@playwright/test`。脚本：
  - `dev`：并行起 `vite` 与 `tsx watch server/index.ts`（用 `concurrently` 或两个终端；优先用 npm 的 `&` 方案避免加依赖）
  - `build`：`vue-tsc --noEmit && vite build && tsx build server/index.ts --outfile dist-server/index.js`（tsx 无 build 子命令时改用 `esbuild` 作为开发依赖）
  - `test`：`node --test server/__tests__ src/**/*.test.ts`
  - `typecheck`、`e2e`
- [ ] 0.5 `tsconfig.json` 拆前后端：`tsconfig.json`（src，DOM）、`tsconfig.server.json`（server，node types）
- [ ] 0.6 `vite.config.ts`：开发时 `/api` 与 `/icons`、`/wallpapers`、`/add` 代理到 `localhost:3000`
- [ ] 0.7 `.gitignore` 加 `data/`、`dist-server/`、`assets/wallpapers-src/`
- [ ] 0.8 `.env.example`
- → 验证：`npm install` 成功；`npm run typecheck` 在空骨架上通过
- → 提交：`chore: 清理旧 Cloudflare 代码并搭建新骨架`

## 阶段 1：后端核心（env / db / auth / bootstrap）

- [ ] 1.1 `server/env.ts`：读 `PASSWORD`、`SESSION_SECRET`（≥32 字节）、`PORT`(3000)、`DATA_DIR`(./data)，缺失抛错
- [ ] 1.2 `server/db.ts`：`node:sqlite` 打开 `DATA_DIR/nav.sqlite`，WAL + 外键，按 `design.md §3` 建表；支持传 `:memory:` 供测试；首次启动写默认 settings（bookmarkletToken 用 `crypto.randomBytes(32).hex`）与默认分组"常用"
- [ ] 1.3 `server/auth.ts`：Cookie 签发/校验（HMAC）、`login_attempts` 锁定逻辑、`requireAuth` 中间件
- [ ] 1.4 `server/routes/auth.ts`、`bootstrap.ts`
- [ ] 1.5 `server/index.ts`：Hono app，挂路由，`serveStatic` 托管 `dist/`、`DATA_DIR/icons`、`DATA_DIR/wallpapers`、`public/wallpapers`；`index.html` 设 `Cache-Control: no-cache`，哈希资源一年
- [ ] 1.6 测试：`server/__tests__/auth.test.ts`（登录成功/失败/5 次锁定/Cookie 过期）、`bootstrap.test.ts`（401 与 200）
- → 验证：`npm test` 通过；`PASSWORD=x SESSION_SECRET=$(openssl rand -hex 32) npx tsx server/index.ts` 起来后 `curl -i localhost:3000/api/bootstrap` 返回 401
- → 提交：`feat(server): 鉴权、数据库与 bootstrap 接口`

## 阶段 2：后端 CRUD 与排序

- [ ] 2.1 `routes/groups.ts`：新增 / 改名 / 删除（`moveTo` 迁移或级联）/ `PUT order`
- [ ] 2.2 `routes/bookmarks.ts`：新增 / 修改 / 删除 / `PUT order`（含跨组移入）；`sort_order` 间隔 1024，重编号逻辑抽到 `lib/order.ts`
- [ ] 2.3 `routes/settings.ts`：GET / PATCH（白名单 key，`bookmarkletToken` 只读）
- [ ] 2.4 测试：`groups.test.ts`、`bookmarks.test.ts`、`order.test.ts`、`settings.test.ts`
- → 验证：`npm test` 通过
- → 提交：`feat(server): 分组、书签、设置的增删改与排序`

## 阶段 3：URL 元信息、图标缓存、导入、bookmarklet

- [ ] 3.1 `routes/meta.ts` 调 `lib/scraper.ts`，返回 `{ finalUrl, title, description, iconCandidates }`；测试 `extractMeta` 用固定 HTML 片段
- [ ] 3.2 `lib/icons.ts`：下载（1MB / 8s 限制）→ sharp 转 64px WebP → `DATA_DIR/icons/{id}.webp` → 更新 `has_icon`；书签新增/修改带 `iconUrl` 时 `setImmediate` 触发；删除书签时删文件
- [ ] 3.3 `lib/bookmarks-html.ts`：解析 Netscape 书签格式（`<DT><H3>` 文件夹、`<DT><A HREF ICON>`），扁平化一层：顶层文件夹 → 分组，嵌套文件夹合并进最近的顶层；测试用 Chrome 导出样例
- [ ] 3.4 `lib/legacy.ts`：旧站 JSON（`{ name, url, description, category, ... }[]`）→ 分组 + 书签；测试
- [ ] 3.5 `routes/import.ts`：两个入口，URL 去重，图标并发 4 异步下载
- [ ] 3.6 `routes/add.ts`：校验 token，302 到 `/#add?url=&title=`
- → 验证：`npm test` 通过；手动 `curl -X POST localhost:3000/api/meta -d '{"url":"https://github.com"}'` 能返回标题与图标候选
- → 提交：`feat(server): URL 元信息抓取、图标本地缓存、书签导入、bookmarklet 入口`

## 阶段 4：壁纸素材与壁纸接口

- [ ] 4.1 用 `image-gen` 技能生成 4 组壁纸（每组横 16:9 + 竖 9:16），提示词见 `design.md §8`；原图存 `assets/wallpapers-src/`
- [ ] 4.2 `scripts/build-wallpapers.ts`（sharp）：产出 `public/wallpapers/{id}-2560.avif/.webp`、`{id}-1280.*`、`{id}-lqip.webp`、`manifest.json`；单张 2560 档 ≤ 300KB
- [ ] 4.3 `lib/images.ts` 复用同一转码函数；`routes/wallpapers.ts`：POST 上传（MIME 白名单、≤10MB）、DELETE（内置拒绝）；首次启动把 manifest 同步进 `wallpapers` 表
- [ ] 4.4 测试：上传非法 MIME 返回 400；删除内置返回 403
- → 验证：`ls -la public/wallpapers` 每张 2560 档 ≤ 300KB；`npm test` 通过
- → 提交：`feat: 内置壁纸素材与壁纸上传接口`

## 阶段 5：前端基础（登录、bootstrap、首页只读）

- [ ] 5.1 `styles/tokens.css`、`base.css`（按 `design.md §7`）
- [ ] 5.2 `api/client.ts`：`fetch` 封装，401 时抛特定错误由 auth store 处理
- [ ] 5.3 三个 store：`auth`（loggedIn、login/logout）、`data`（groups、bookmarks、按组索引的 computed）、`settings`
- [ ] 5.4 `App.vue`：挂载拉 bootstrap → 登录屏或首页；把 `--accent` 写到根节点
- [ ] 5.5 `LoginScreen.vue`：壁纸 + 居中密码框 + 错误/锁定提示
- [ ] 5.6 `home/Wallpaper.vue`：`<picture>` 两档 + LQIP 淡入 + 遮罩；横竖按媒体查询
- [ ] 5.7 `TopBar.vue`、`GroupPanel.vue`、`BookmarkGrid.vue`、`BookmarkCard.vue`、`ui/FallbackIcon.vue`
- → 验证：`npm run dev` 后浏览器能登录并看到分组与卡片；`npm run typecheck` 通过
- → 提交：`feat(web): 登录、壁纸与首页只读展示`

## 阶段 6：搜索与快捷键

- [ ] 6.1 `composables/useFilter.ts`：纯函数 `filterBookmarks(list, groups, query)` 返回匹配 id 集合与高亮区间；`src/composables/useFilter.test.ts`
- [ ] 6.2 `composables/useHotkeys.ts`：`/`、`Cmd/Ctrl+K` 聚焦搜索，`Esc` 清空/关闭面板
- [ ] 6.3 `SearchBox.vue`：输入过滤、高亮渲染、回车行为（有匹配开首个，无匹配跳搜索引擎）
- → 验证：`npm test` 通过；手动验证快捷键与回车两种行为
- → 提交：`feat(web): 搜索框、高亮与快捷键`

## 阶段 7：编辑能力（面板、表单、拖拽）

- [ ] 7.1 `panels/SlidePanel.vue`：右侧滑入、`Esc` 关闭、焦点陷阱
- [ ] 7.2 `panels/BookmarkForm.vue`：URL 失焦/防抖调 `/api/meta`，图标候选选择，分组选择，回车保存；处理 `#add?url=&title=` 预填
- [ ] 7.3 `panels/GroupForm.vue`；分组删除确认（移到其他组 / 一起删）
- [ ] 7.4 卡片悬停操作按钮 + 右键菜单：编辑、删除、移到分组
- [ ] 7.5 `composables/useDrag.ts`：原生 HTML5 拖拽；纯函数 `reorder(list, fromId, toIndex)` 单测；卡片组内/跨组、分组面板排序；乐观更新 + 失败回滚
- [ ] 7.6 `ui/Toast.vue` + `useToast`
- → 验证：`npm test` 通过；手动：新增 → 拖拽 → 刷新顺序保持 → 删除
- → 提交：`feat(web): 书签与分组的新增、编辑、删除、拖拽排序`

## 阶段 8：设置面板

- [ ] 8.1 `SettingsPanel.vue`：分区为 壁纸 / 搜索引擎 / 强调色 / 收藏按钮 / 导入 / 退出登录
- [ ] 8.2 `WallpaperPicker.vue`：九宫格缩略图（用 1280 档）、当前项高亮、上传、删除自定义
- [ ] 8.3 搜索引擎：预置 Google / Bing / DuckDuckGo + 自定义模板（含 `%s`）
- [ ] 8.4 Bookmarklet：生成 `javascript:` 链接的 `<a draggable>`，附一句"拖到书签栏"
- [ ] 8.5 `ImportSection.vue`：两个文件入口，导入后刷新 bootstrap 并 toast 数量
- → 验证：手动切壁纸 / 上传 / 导入 Chrome 书签 HTML / 拖 bookmarklet 到书签栏并在另一网页点击
- → 提交：`feat(web): 设置面板、壁纸切换与导入`

## 阶段 9：移动端与打磨

- [ ] 9.1 `<640px`：网格 3 列、面板全屏、隐藏拖拽手柄
- [ ] 9.2 `prefers-reduced-motion` 关闭过渡
- [ ] 9.3 首屏体积检查：`vite build` 后 `gzip -c dist/assets/*.js | wc -c` 合计 < 80KB；超了先查是否误引依赖
- [ ] 9.4 Lighthouse 跑一次（Chrome DevTools），性能 ≥ 95，把分数记到 `task.py` notes
- → 提交：`feat(web): 移动端适配与性能打磨`

## 阶段 10：部署与端到端

- [ ] 10.1 `Dockerfile`（多阶段，见 `design.md §10`）、`docker-compose.yml`、`.env.example`
- [ ] 10.2 `docker compose up --build` 本地验证：登录、新增、重启容器数据仍在
- [ ] 10.3 `e2e/main.spec.ts`（Playwright）：登录 → 贴 URL 新增 → 拖拽 → 搜索回车 → 切壁纸
- [ ] 10.4 重写 `README.md`：功能、截图、`docker compose` 三步部署、环境变量、备份、bookmarklet 与导入说明、旧站迁移步骤
- → 验证：`npm run e2e` 通过；`docker compose up` 后浏览器可用
- → 提交：`chore: Docker 部署、端到端测试与 README`

## 阶段 11：收尾

- [ ] 11.1 跑 `trellis-check`：spec 合规、typecheck、test、体积
- [ ] 11.2 更新 `.trellis/spec/frontend/*` 里的目录结构与状态管理说明为新结构（`trellis-update-spec`）
- [ ] 11.3 合并分支到 `main`（`/trellis:finish-work`）
- [ ] 11.4 提醒用户：下线旧站前访问一次旧站 `/api/projects` 保存 JSON

## 审查门

- 阶段 3 结束：后端 API 全部就绪，用 `curl` 走一遍 `design.md §5` 契约，确认响应形状与文档一致，再进前端。
- 阶段 7 结束：交互全部就绪，用户过一遍手感（拖拽阻尼、面板动效、搜索响应），此时调整视觉最便宜。
- 阶段 10 结束：完整验收 `prd.md` 的 Acceptance Criteria 逐条打勾。

## 回滚点

| 阶段 | 回滚方式 |
| --- | --- |
| 0 | `git checkout main`，旧代码与工作区快照都在 |
| 1–4 | 后端独立，可 `git revert` 单阶段提交，不影响其他阶段 |
| 5–9 | 前端各阶段提交独立，可单独 revert |
| 10 | 删除 Docker 相关文件即可，不影响代码 |
