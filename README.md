# 极光导航 · Aurora Nav

一个**集中入口**的个人项目导航站。极光玻璃拟态视觉，毛玻璃卡片 + 流动渐变光斑 + 鼠标光晕 + 卡片 3D 倾斜，再叠上 **Uptime 风格的存活检测**和**截图 OCR 自动导入**。一站式部署在 Cloudflare Pages。

## 特性

- 极光玻璃 UI：4 球极光背景、毛玻璃卡片、鼠标光晕、卡片 hover 3D 倾斜与发光
- **跨浏览器同步**：数据存 Cloudflare KV，任何浏览器打开同一域名都能看到
- **存活检测**：每张卡 30 根状态柱（绿/黄/红/灰）+ 状态点 + 在线率，懒检测策略，访问触发后台刷新（5 分钟内不重复）
- **截图 OCR 导入**：粘贴 Cloudflare/Zeabur/Vercel 控制台截图，AI 自动识别"项目名 + URL"批量入库
- **Cmd+K 命令面板**：模糊搜索 + 键盘选择 + 回车跳转
- 搜索 + 分类筛选 + 访问热度排序 + 置顶
- 极简鉴权：只读公开（任何人能看你的导航站）；写入需密码

## 技术栈

| 维度 | 选型 |
| --- | --- |
| 前端 | Vue 3.5 + TypeScript + Vite + Pinia |
| 后端 | Cloudflare Pages Functions（TS，无独立服务器） |
| 存储 | Cloudflare KV（项目列表 + 健康历史） |
| 视觉 | 原生 CSS 设计令牌（无 Tailwind） |
| OCR | OpenAI gpt-4o / 阿里通义千问 qwen-vl-max / Anthropic Claude（任选） |

## 本地开发

```bash
npm install
npm run dev          # 仅前端，访问 http://localhost:5173（开发模式自动加载演示数据）
```

需要测试 Pages Functions（含 KV / OCR / 健康检测）：

```bash
npm run dev:cf       # wrangler pages dev，访问 http://localhost:8788
```

类型检查：

```bash
npm run typecheck
```

构建：

```bash
npm run build        # 产物输出到 dist/
```

## 部署到 Cloudflare Pages

### 1. 创建 KV 命名空间

```bash
npx wrangler kv:namespace create NAV_KV
```

把命令返回的 `id` 填入 [`wrangler.toml`](./wrangler.toml) 的 `[[kv_namespaces]] id = "..."`。

### 2. 设置环境变量（密钥）

进入 Cloudflare Dashboard → 你的 Pages 项目 → Settings → Environment variables（Production），加入以下 4 项：

| 名称 | 用途 | 示例 |
| --- | --- | --- |
| `EDIT_PASSWORD` | 进入"编辑模式"时输入的密码 | `correct-horse-battery-staple` |
| `EDIT_SECRET` | 签发会话 token 的随机串，**至少 32 字节** | 用 `openssl rand -hex 32` 生成 |
| `OCR_PROVIDER` | OCR 服务商：`dashscope` / `openai` / `anthropic` | `dashscope` |
| `OCR_API_KEY` | 上述服务商的 API Key | 申请链接见下方 |

也可以用命令行：

```bash
npx wrangler pages secret put EDIT_PASSWORD
npx wrangler pages secret put EDIT_SECRET
npx wrangler pages secret put OCR_PROVIDER
npx wrangler pages secret put OCR_API_KEY
```

### 3. 部署

```bash
npm run deploy
```

部署成功后访问 `https://<你的项目>.pages.dev`。要绑定自定义域名就在 Pages 项目的 Custom Domains 里加。

## OCR 服务对比

| 提供商 | 模型 | 申请链接 | 特点 |
| --- | --- | --- | --- |
| `dashscope`（推荐） | qwen-vl-max | https://dashscope.console.aliyun.com/apiKey | 国内访问快，价格低，识别中文项目名准确 |
| `openai` | gpt-4o | https://platform.openai.com/api-keys | 通用最强，需要海外网络访问 |
| `anthropic` | claude-sonnet-4-6 | https://console.anthropic.com/settings/keys | 文档理解强，需要海外网络访问 |

## 数据存储约定

KV 键：

| Key | 内容 |
| --- | --- |
| `projects` | `Project[]` JSON，全站项目列表 |
| `health:summary` | `{ summaries: Record<id, HealthSummary>, updatedAt }`，给前端用的快照 |
| `health:{projectId}` | `HealthSample[]`，单个项目最近 30 次检测历史 |

`Project` 字段：`id` / `name` / `url` / `description?` / `category` / `icon?`（emoji 或图片 URL） / `accentColor?`（卡片强调色） / `pinned?` / `createdAt` / `visits`。

## 鉴权与安全

- 只读 API（`GET /api/projects`、`GET /api/health`）完全公开 — 任何人都能看到你的导航站。
- 写入 API（`PUT /api/projects`、`POST /api/ocr`、`POST /api/health`）需要 Bearer token。
- token 通过 `POST /api/auth { password }` 换取，HMAC-SHA256 签名，有效期 7 天。
- token 存浏览器 `sessionStorage`，关闭浏览器后失效（与窗口生命周期一致）。

## 已知约束

- `backdrop-filter` 在 Safari < 15.4 不支持，已退化为深色半透明背景。
- 卡片 3D 倾斜在 `prefers-reduced-motion: reduce` 下自动关闭。
- 健康检测用"懒检测"，第一次访问可能拿到空数据；5 分钟后再访问就会有完整 30 根柱条。
- OCR 单次请求图片建议 < 8MB；过大请压缩或裁剪后再上传。
- 如果想叠加定时刷新（不依赖访问触发），可在 `wrangler.toml` 里启用 `[triggers] crons = ["*/5 * * * *"]`，部分账户需要先在 Dashboard 开启 Pages Cron Triggers。

## 目录速览

```
项目导航站/
├── src/                  Vue 前端
│   ├── components/       视觉与交互组件
│   ├── stores/           Pinia: projects / health / ui / auth
│   ├── composables/      useTilt / useHealthPolling / useCommandPalette / useFuzzySearch
│   ├── styles/           tokens.css + aurora.css + base.css
│   ├── api/              fetch 封装
│   ├── types/            前后端共享类型
│   └── utils/            id 生成 + 演示数据
├── functions/            Cloudflare Pages Functions
│   ├── _lib/             auth / http / check
│   └── api/              projects / auth / visit / health / ocr
├── wrangler.toml         Pages 项目配置
└── package.json
```
