# 技术设计：个人书签导航站

对应 `prd.md`。本文只讲技术方案：边界、契约、数据流、取舍。

## 1. 总体架构

```
浏览器 ──HTTP──▶ Node 进程（Hono）
                  ├─ /api/*        JSON API
                  ├─ /add          bookmarklet 入口（重定向到首页并带参数）
                  ├─ /icons/*      本地缓存图标（静态，长缓存）
                  ├─ /wallpapers/* 内置 + 上传壁纸（静态，长缓存）
                  └─ /*            dist/ 静态前端（index.html 不缓存，资源哈希长缓存）
                  │
                  └─ data/
                       ├─ nav.sqlite
                       ├─ icons/{bookmarkId}.webp
                       └─ wallpapers/{id}-{w}.{avif,webp} + {id}-lqip.webp
```

- 单进程、单容器。前端构建产物由同一个 Node 进程托管，不需要 Nginx。
- 运行时依赖：`hono`、`@hono/node-server`、`sharp`、`vue`、`pinia`。数据库用 Node 24+ 内置 `node:sqlite`，不装原生模块。

## 2. 仓库结构

```
/
├─ server/                 后端（TypeScript，tsx 打包成 dist-server/index.js）
│  ├─ index.ts             启动、静态托管、路由挂载
│  ├─ env.ts               读取并校验 PASSWORD / SESSION_SECRET / DATA_DIR / PORT
│  ├─ db.ts                打开 SQLite、建表、迁移
│  ├─ auth.ts              登录、Cookie 签发校验、失败锁定
│  ├─ routes/
│  │   ├─ auth.ts  bootstrap.ts  groups.ts  bookmarks.ts
│  │   ├─ meta.ts  import.ts  wallpapers.ts  settings.ts  add.ts
│  ├─ lib/
│  │   ├─ scraper.ts       从旧 functions/_lib/scraper.ts 搬入，去掉 bodyText
│  │   ├─ icons.ts         下载图标 → sharp 转 64px WebP → 落盘
│  │   ├─ images.ts        壁纸转码：2560/1280 宽 AVIF+WebP + 32px LQIP
│  │   ├─ bookmarks-html.ts  Netscape 书签 HTML 解析
│  │   └─ legacy.ts        旧站 JSON 解析
│  └─ __tests__/           node:test
├─ src/                    前端（Vue 3 + Vite）
│  ├─ main.ts  App.vue
│  ├─ api/client.ts
│  ├─ stores/auth.ts  data.ts  settings.ts
│  ├─ components/
│  │   ├─ login/LoginScreen.vue
│  │   ├─ home/TopBar.vue  SearchBox.vue  GroupPanel.vue  BookmarkCard.vue  BookmarkGrid.vue
│  │   ├─ panels/SlidePanel.vue  BookmarkForm.vue  GroupForm.vue  SettingsPanel.vue  ImportSection.vue  WallpaperPicker.vue
│  │   └─ ui/IconButton.vue  Toast.vue  FallbackIcon.vue
│  ├─ composables/useDrag.ts  useHotkeys.ts  useFilter.ts  useToast.ts
│  ├─ styles/tokens.css  base.css
│  └─ types.ts
├─ public/wallpapers/      内置壁纸（构建时拷贝，运行时也可从 data/ 覆盖）
├─ e2e/                    Playwright
├─ Dockerfile  docker-compose.yml  .env.example
└─ package.json            单包，前后端脚本都在这里
```

## 3. 数据模型（SQLite）

```sql
CREATE TABLE groups (
  id          TEXT PRIMARY KEY,          -- nanoid 风格随机串（crypto.randomUUID 截断）
  name        TEXT NOT NULL,
  icon        TEXT,                      -- emoji，可空
  sort_order  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL           -- Unix ms
);

CREATE TABLE bookmarks (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  url         TEXT NOT NULL,
  description TEXT,
  has_icon    INTEGER NOT NULL DEFAULT 0, -- 1 表示 data/icons/{id}.webp 存在
  sort_order  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_bookmarks_group ON bookmarks(group_id, sort_order);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                     -- JSON 字符串
);
-- 预置 key：wallpaper（当前壁纸 id）、searchEngine（{ name, template }）、
--          accent（十六进制色）、bookmarkletToken（32 字节 hex，首次启动生成）

CREATE TABLE wallpapers (
  id          TEXT PRIMARY KEY,
  builtin     INTEGER NOT NULL DEFAULT 0,
  orientation TEXT NOT NULL,             -- 'landscape' | 'portrait'
  pair_id     TEXT,                      -- 横竖配对，同一主题共用
  created_at  INTEGER NOT NULL
);

CREATE TABLE login_attempts (
  ip          TEXT PRIMARY KEY,
  fails       INTEGER NOT NULL,
  locked_until INTEGER
);
```

- `sort_order` 用间隔 1024 的整数，插入取中值，用尽时整组重编号。批量排序接口直接传完整 id 顺序，服务端重编号，前端不用算。
- 图标不存 URL，只存 `has_icon`，路径由 id 推导，避免脏数据。
- 内置壁纸在首次启动时扫描 `public/wallpapers/manifest.json` 写入表。

## 4. 鉴权

- `POST /api/auth/login { password }`：与 `PASSWORD` 常量时间比较。成功���发 Cookie `nav_session`，值为 `base64url(expiresAt).HMAC-SHA256(SESSION_SECRET, expiresAt)`，`HttpOnly; SameSite=Lax; Secure(生产); Max-Age=90d`。
- 失败：`login_attempts` 按 IP 计数，5 次后 `locked_until = now + 10min`，锁定期间直接 429。成功清零。
- 中间件：除 `/api/auth/login`、`/add`（自带 token）、静态资源外，所有 `/api/*` 校验 Cookie，失败 401。静态 `index.html` 不拦，前端自己根据 `/api/bootstrap` 的 401 切换到登录界面。
- `POST /api/auth/logout` 清 Cookie。

## 5. API 契约

统一：JSON 请求/响应；错误格式 `{ error: string, detail?: string }`；ID 均为字符串。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | `{ password }` → 204 |
| POST | `/api/auth/logout` | → 204 |
| GET | `/api/bootstrap` | `{ groups: Group[], bookmarks: Bookmark[], settings: Settings, wallpapers: Wallpaper[] }` |
| POST | `/api/groups` | `{ name, icon? }` → Group |
| PATCH | `/api/groups/:id` | `{ name?, icon? }` → Group |
| DELETE | `/api/groups/:id?moveTo=:gid` | 有 `moveTo` 时书签迁移，否则级联删除 → 204 |
| PUT | `/api/groups/order` | `{ ids: string[] }` → 204 |
| POST | `/api/bookmarks` | `{ groupId, title, url, description?, iconUrl? }` → Bookmark；`iconUrl` 存在则异步下载图标 |
| PATCH | `/api/bookmarks/:id` | `{ title?, url?, description?, groupId?, iconUrl? }` → Bookmark |
| DELETE | `/api/bookmarks/:id` | → 204，同时删图标文件 |
| PUT | `/api/bookmarks/order` | `{ groupId, ids: string[] }` → 204，ids 中不在该组的书签会被移入 |
| POST | `/api/meta` | `{ url }` → `{ finalUrl, title?, description?, iconCandidates: string[] }`，8 秒超时 |
| POST | `/api/import/html` | multipart 文件 → `{ groups: number, bookmarks: number }` |
| POST | `/api/import/legacy` | JSON 数组 → 同上 |
| GET | `/api/settings` | Settings |
| PATCH | `/api/settings` | Partial<Settings> → Settings |
| POST | `/api/wallpapers` | multipart 图片（≤10MB）→ Wallpaper |
| DELETE | `/api/wallpapers/:id` | 内置的拒绝 → 204 |
| GET | `/add?token=&url=&title=` | 校验 token 后 302 到 `/#add?url=&title=` |

前端类型：

```ts
interface Group    { id; name; icon: string | null; sortOrder: number }
interface Bookmark { id; groupId; title; url; description: string | null; hasIcon: boolean; sortOrder: number }
interface Wallpaper{ id; builtin: boolean; orientation: 'landscape' | 'portrait'; pairId: string | null }
interface Settings { wallpaper: string; searchEngine: { name: string; template: string }; accent: string; bookmarkletToken: string }
```

## 6. 关键数据流

**首页加载**：`App.vue` 挂载 → `GET /api/bootstrap` → 200 则填三个 store 并渲染首页；401 则渲染登录屏。登录成功后重新拉 bootstrap。

**新增书签**：打开面板 → 粘贴 URL → `blur` 或 500ms 防抖后 `POST /api/meta` → 回填标题/描述、展示图标候选（前端直接 `<img>` 外链预览，只在这一处允许外链）→ 保存时 `POST /api/bookmarks` 带选中的 `iconUrl` → 服务端先写库返回，再 `setImmediate` 下载图标，成功后 `has_icon = 1`。前端保存后 3 秒轮询一次该书签或在下次 bootstrap 时自然更新；卡片在 `hasIcon=false` 时显示兜底色块。

**拖拽**：`useDrag` 基于原生 `dragstart/dragover/drop`；拖动时本地立即重排 store（乐观），`drop` 后调 `PUT /api/*/order`，失败回滚并 toast。跨组拖同一接口。

**搜索**：`useFilter` 在前端对 `bookmarks` 做小写子串匹配（标题、URL、描述、所属分组名），返回匹配 id 集合和高亮片段。匹配为空时首页保持全量并显示"回车用 X 搜索"提示。

**Bookmarklet**：设置页生成
`javascript:location.href='https://站点/add?token=T&url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)`。
服务端校验 token 后 302 到 `/#add?...`，前端启动时若 hash 为 `#add` 且已登录则直接打开新增面板预填；未登录则登录后再打开。

**导入**：解析在服务端；每条书签进对应分组（同名分组复用）；URL 相同的跳过；图标批量异步下载，并发限 4。

## 7. 视觉系统落地

`styles/tokens.css`：

```css
:root {
  --accent: #e8c87a;                /* 可被 settings.accent 覆盖，App.vue 写到 style */
  --text: rgb(255 255 255 / 0.92);
  --text-2: rgb(255 255 255 / 0.60);
  --glass-panel: rgb(255 255 255 / 0.08);
  --glass-card: rgb(255 255 255 / 0.06);
  --glass-card-hover: rgb(255 255 255 / 0.12);
  --glass-sheet: rgb(255 255 255 / 0.12);
  --stroke: rgb(255 255 255 / 0.15);
  --blur-panel: 20px; --blur-sheet: 40px;
  --r-panel: 20px; --r-card: 14px;
  --dur: 180ms; --ease: cubic-bezier(.2,.7,.2,1);
}
```

- 壁纸：`<picture>` 内 AVIF/WebP `srcset` 两档，`sizes="100vw"`；先用 32px LQIP 拉伸 + `filter: blur(20px)` 占位，大图 `onload` 后淡入。横竖版按 `(orientation: portrait)` 媒体查询选。
- 遮罩：壁纸上一层 `linear-gradient(180deg, rgb(0 0 0/.35), rgb(0 0 0/.15) 40%, rgb(0 0 0/.55))`。
- backdrop-filter 只出现在 `.group-panel`、`.card:hover`（可选，先不加）、`.sheet`。卡片默认不加模糊，只靠半透明底。
- 字体：`font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`。
- 兜底图标：`FallbackIcon.vue`，背景色 = `hsl(hash(hostname) % 360, 55%, 45%)`，文字取标题首个字符。
- 移动端（<640px）：网格 3 列、隐藏拖拽手柄、面板全屏。

## 8. 壁纸素材生产

- 用 `image-gen` 技能生成 4 组主题（每组横 16:9 与竖 9:16 各一张），风格提示统一为"韩漫 / 乙游立绘风，成年男性，健美腹肌，精致面容，深色氛围光，右侧（横版）或下半部（竖版）放人物，另一侧留空"。内容保持非露骨（上身赤裸可、不涉及性器官）。
- 生成的原图放 `assets/wallpapers-src/`（不打包），用 `scripts/build-wallpapers.ts`（sharp）产出 `public/wallpapers/{id}-2560.avif/.webp`、`{id}-1280.*`、`{id}-lqip.webp` 和 `manifest.json`。
- 单张 2560 档控制在 300KB 内，AVIF 质量 50 起调。

## 9. 错误处理与边界

- 环境变量缺失：启动时抛错退出，日志写明缺哪个。
- `/api/meta` 失败：返回 200 且各字段为空 + `error` 字段，前端提示"未能抓取，可手动填写"。
- 图标下载：限 1MB、8s；非图片 MIME 或 sharp 解析失败 → 放弃，`has_icon` 保持 0。
- 壁纸上传：MIME 白名单（jpeg/png/webp/avif）、≤10MB、sharp 失败返回 400。
- 写操作全部乐观更新；失败回滚 store 并 toast。
- SQLite 打开 `PRAGMA journal_mode=WAL; foreign_keys=ON`。

## 10. 部署

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build          # vite build + tsx 打包 server → dist/ 与 dist-server/

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev      # 仅 hono、@hono/node-server、sharp
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
VOLUME /app/data
EXPOSE 3000
CMD ["node", "dist-server/index.js"]
```

`docker-compose.yml`：映射 `3000`、挂载 `./data:/app/data`、`env_file: .env`。
`.env.example` 列出 `PASSWORD`、`SESSION_SECRET`、可选 `PORT`、`DATA_DIR`。

## 11. 测试策略

- 后端 `node:test` + `node:sqlite` 内存库：鉴权（成功、失败锁定、Cookie 过期）、分组与书签 CRUD、排序重编号、删除分组迁移/级联、书签 HTML 解析、旧 JSON 解析、scraper 的 `extractMeta`。
- 前端：`vue-tsc --noEmit`；`useFilter`、`useDrag` 的纯函数部分用 `node:test` 跑（不引 vitest）。
- E2E：Playwright 一条主路径，跑在 `docker compose up` 起的实例上。
- 性能：`vite build` 后检查 gzip 体积；Lighthouse 手动跑一次记录到任务 notes。

## 12. 取舍说明

- **不做 SSR**：密码锁后的单人站，SSR 无收益，反而增加复杂度。
- **不用拖拽库 / 路由库 / UI 库**：需求面窄，原生足够，守住 80KB 预算。
- **图标本地化**：牺牲首次新增的一点延迟，换来首页零外链、隐私和加载稳定。
- **`node:sqlite` 而非 better-sqlite3**：免原生编译，Docker 镜像更简单；代价是要求 Node ≥ 24。
- **sharp 是唯一原生依赖**：壁纸转码和图标压缩都需要，alpine 有预编译包。
- **旧代码全删不保留兼容**：用户明确要求整体重构；旧数据通过导入 JSON 迁移。
