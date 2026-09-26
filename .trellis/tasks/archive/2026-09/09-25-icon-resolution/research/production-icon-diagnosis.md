# 线上图标缺失逐条诊断（2026-09-25）

## 采集方式

- 部署位置：yoyo-9（64.83.25.9），容器 `nav`，数据目录 `/root/apps/nav/data/`（见 `D:\code\服务器项目部署与记录\yoyo-9-64.83.25.9.md`「nav 项目」段）。
- 数据：容器内用 `node:sqlite` 以 `readOnly: true` 打开 `/app/data/nav.sqlite` 读取，没有写库。
- 抓取复现：在 `nav` 容器里运行一段诊断脚本，页面提取规则逐字照抄 `server/lib/scraper.ts` 的 `extractLogoCandidates`，下载与转码沿用 `server/lib/icons.ts` 的判断顺序（HTTP 状态 → Content-Type → sharp）。容器与线上进程共用同一出口 IP 和同一份 sharp 二进制，结果等同于线上真实行为。脚本用完已删除。
- 对照：页面抓取失败时，再用浏览器 User-Agent 重试一次，确认是不是 UA 导致的。

## 数据概况

- 共 53 条书签，26 条有图标，27 条没有。
- 52 条是 2026-09-24 07:46（北京时间）一次性导入的；「linuxdo论坛」是同日 15:17 手动新增的。

## 逐条结果（27 条缺图标）

| # | 标题 | 网址 | 线上实测 | 根因 |
| --- | --- | --- | --- | --- |
| 1 | L站公益站-lucky | new.lucky0625.qzz.io/dashboard/overview | 页面 200，只声明 `/favicon.ico`，sharp 解不了 | ICO |
| 2 | lucky API | api.lucky0625.tech | 同上 | ICO |
| 3 | DEEIX Chat | deeix.lucky0625.us.ci/chat | 页面无图标标签，`/favicon.ico` 是 ICO | ICO |
| 4 | Grok2API | grok.204152.xyz/dashboard | 标签写着 `type="image/png"`，实际下载到的是 ICO | ICO |
| 5 | 总览 - 控制台 - 腾讯云 | console.cloud.tencent.com | 跳转到登录页，声明的图标是 ICO | ICO |
| 6 | 邮箱管理 | outlook.lucky0625.qzz.io/app/messages | ICO | ICO |
| 7 | Narra Image | narra.lucky0625.us.ci | 256×256 的 ICO | ICO |
| 8 | 首页 — MaiBot Dashboard | maibot.lucky0625.us.ci | `/maimai.ico`，ICO | ICO |
| 9 | SQLPub | sqlpub.com | ICO | ICO |
| 10 | EVE Chat | luckyexe.netlify.app | data URI 形式的 SVG 被截断成 `data:image/svg+xml,<svg xmlns=`；兜底的 `/favicon.ico` 又是 ICO | 属性值解析 + ICO |
| 11 | 雨读 | yudu.204152.xyz/library | data URI 形式的 SVG 被截断 | 属性值解析 |
| 12 | Projects - Zeabur | zeabur.com/projects | 页面有 8 个图标标签，全部是 `href` 写在 `rel` 前面，一个都没认出；兜底 `/favicon.ico` 404 | 属性顺序 |
| 13 | NewAPI 排行榜 | lead.lucky0625.tech | 无图标标签，`/favicon.ico` 返回空内容 | 站点本身没有图标 |
| 14 | POOL//OPS · 号池监控 | haochi.lucky0625.us.ci | 无图标标签，`/favicon.ico` 404 | 站点本身没有图标 |
| 15 | Firecrawl 代理 · 管理面板 | firecrawl.lucky0625.us.ci | 无图标标签，`/favicon.ico` 返回 HTML | 站点本身没有图标 |
| 16 | QQ 登录 | qr.lucky0625.us.ci | 无图标标签，`/favicon.ico` 404 | 站点本身没有图标 |
| 17 | 仪表盘 \| Xboard | air.lucky0625.tech/#/dashboard | 无图标标签，`/favicon.ico` 404 | 站点本身没有图标 |
| 18 | lucky-机场 | air.lucky0625.tech/144b73d9#/finance/coupon | 页面 200，无图标标签，同源 `/favicon.ico` 404 | 站点本身没有图标 |
| 19 | CLI Proxy API Management Center | cpa-codex.lucky0506.shop/management.html#/login | 页面 404（浏览器 UA 同样 404） | 站点已失效 |
| 20 | CLI Proxy API Management Center | cpa-codex.lucky0506.shop/management.html#/plugin-store | 与上一条是同一个页面，404 | 站点已失效 |
| 21 | CLI Proxy API Management Center | cpa-grok.lucky0625.tech/management.html# | 404 | 站点已失效 |
| 22 | CPA Manager Plus | cpa-grokusage.lucky0625.tech/management.html# | 404 | 站点已失效 |
| 23 | （codex2）CPA Manager Plus | cpa-codex2usage.lucky04.dpdns.org/management.html# | 526（Cloudflare：源站证书无效） | 站点已失效 |
| 24 | CLI Proxy API Management Center | cli.lucky0625.qzz.io/management.html# | DNS 解析失败（ENOTFOUND） | 站点已失效 |
| 25 | CLI Proxy API Management Center | cpa-codex-lucky.zeabur.app/management.html# | 404 | 站点已失效 |
| 26 | gemini-web2api 管理面板 | gemini.lucky0625.us.ci/admin | 8 秒超时，浏览器 UA 同样超时 | 站点已失效 |
| 27 | linuxdo论坛 | linux.do | 页面与 `/favicon.ico` 都是 403 `cf-mitigated: challenge`，浏览器 UA 同样 403 | Cloudflare 质询 |

## 归类统计

| 根因 | 条数 | 代码能否解决 |
| --- | --- | --- |
| sharp 不支持 ICO | 9（另有 EVE Chat 也会被 ICO 兜底救回） | 能：自己解 ICO |
| 属性值解析把 data URI 截断 | 2（EVE Chat、雨读） | 能：按引号配对读属性值 |
| `<link>` 里 `href` 写在 `rel` 前 | 1（Zeabur） | 能：属性解析与顺序无关 |
| 站点本身没有图标 | 6 | 不能自动解决，只能手动指定或把兜底做好看 |
| 站点已失效 | 8 | 不是图标问题，书签本身已经打不开 |
| Cloudflare 质询 | 1（linux.do） | 服务端直抓无解，只能手动指定或借第三方图标服务 |

修好三类代码缺陷后，能自动拿到图标的书签从 26 条增加到 38 条。

## 代码侧根因与锚点

- **sharp 不支持 ICO**：`server/lib/icons.ts:51` 直接把下载结果交给 sharp。本地抽样的 GitHub、百度、知乎、掘金、B 站、Google、react.dev 的 `favicon.ico` 全部是「ICO 容器 + 32 位 BMP 条目」，sharp 一律报 `Input buffer contains unsupported image format`。`icons.ts:76-82` 的注释以为只有 BMP 条目的 ICO 才解不了，实际上 sharp 不认 ICO 容器本身。
- **属性值解析**：`server/lib/scraper.ts:161-162` 的正则用 `[^"']+` 读属性值，双引号包着的值里一出现单引号（`data:image/svg+xml,<svg xmlns='…'>` 这种写法很常见）就被截断。
- **属性顺序**：同一个正则要求 `rel` 出现在 `href` 之前；也不认无引号属性（`<link rel=icon href=/x.png>`）和 `rel="alternate icon"`。
- **sizes 永远取不到**：同一个正则里 `sizes` 分组前面是惰性匹配，实测 `sizes` 从来没被捕获，多个 apple-touch-icon 时按文档顺序而不是尺寸挑选（本地用例：57×57 写在 180×180 前面时，先选 57×57）。
- **og:image 优先级高于 `<link rel="icon">`**（`scraper.ts:180` 给 70 分，`icon` 只有 50 分）：GitHub 的第一候选是 618KB 的分享横幅。线上 26 个已有图标里没有踩到这一条，属于潜在问题。
- **Content-Type 严格校验**：`icons.ts:166-167` 只认 `image/*`。线上没有因此失败的实例，但 Grok2API 这类「标签写 png、实际给 ICO」的情况说明声明信息不可靠，按文件头判断更稳。

## 流程侧缺口

- 手动新增时图标候选默认不选中，不点就不下载（`src/components/panels/BookmarkForm.vue:27`、`:121`、`:187`）。候选预览由浏览器渲染，浏览器能显示 ICO，于是会出现「预览有图标、保存后没有」。
- 编辑面板不抓取、不显示图标区（`BookmarkForm.vue:49`、`:172`），已有书签无法重抓或换图标。
- 保存后前端不刷新图标状态（`src/stores/data.ts:167-178` 只把接口返回值插进列表），原设计文档里的「保存后 3 秒轮询一次」没有实现；图标失败时也没有任何提示。
- 旧站 JSON 导入丢弃了 `icon` 字段（`server/lib/legacy.ts:8-9`）。旧站的 `icon` 可以是 http(s) 图片地址（旧 `src/components/card/ProjectCard.vue:20-22`）。线上这批数据已经导入完毕，这一条只影响以后的导入。

## 已有图标的观感问题（给「首页视觉调整」子任务）

- Google AI Studio 的图标是黑色线条加透明底，放在深色卡片上几乎看不见。
- 「叙说·春信」「米饭机」用的是站点自己的照片式 logo（分别来自 `logo.jpg` 与 `icon-180.png`，不是 og:image），缩到 32px 后像一张小照片。

## 第三方图标服务可达性（本地电脑实测，不是服务器）

- `https://www.google.com/s2/favicons?domain=linux.do&sz=64`、`https://icons.duckduckgo.com/ip3/linux.do.ico`、`https://favicon.im/linux.do` 均返回 200 的 PNG。
- 这类服务只认识公网站点；上面「站点本身没有图标」的 6 个自建服务，第三方服务同样拿不到。
- 服务器（yoyo-9 容器内）补测：Google 对 linux.do 返回 128×128 清晰 PNG；对私有或不存在的站点，Google 与 DuckDuckGo 都返回 404，可据此判定「公共服务也没有」。

## ICO 解码原型（线上真实文件）

- 线上 9 个 ICO 与本地抽样的 GitHub、Google，条目格式只有两种：PNG 条目、32 位 BMP 条目。解码器覆盖这两种即可，不需要支持调色板 BMP。
- 一次性原型在全部 12 个样本上成功：取最大条目 → RGBA → sharp 转 64px WebP，输出 1–3KB，观感正常（L站、lucky API、DEEIX、Grok2API、腾讯云、邮箱管理、Narra、MaiBot、SQLPub、EVE Chat、GitHub、Google）。

## 内嵌 SVG 在服务器渲染的问题

- 容器里没有字体（sharp 报 `Fontconfig error: Cannot load default config file`）。SVG 里的 `<text>` 会被渲染成方框：
  - 雨读的图标是深色圆角方块上写一个「雨」字，渲染结果是方框。
  - EVE Chat 的图标是 emoji 💬，渲染结果同样是方框；它可以改由 `/favicon.ico` 兜底拿到。
- 不含 `<text>` 的 SVG（纯路径）渲染正常。
