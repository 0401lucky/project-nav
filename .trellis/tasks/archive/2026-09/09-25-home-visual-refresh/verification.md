# 接续验收（2026-09-28）

从 Claude 中断的位置接续：实现已在工作区，最近一次 E2E 结果为 passed；本地 3100 服务保留 9 组、52 条书签和 31 个已上传图标。下面记录本轮独立验证，不把前一轮推测当作结论。

## 验收清单

- 桌面 1440×900：四张内置壁纸逐张切换并截图，检查左侧面板、右侧人物留白、分组多列和文字可读性。
- 手机 390×844：三列竖排卡片、主机名截断、分组操作常显、列表滚动和底部新建分组入口。
- 功能与层叠：搜索输入、顶栏新增、分组添加/编辑、新建分组、卡片菜单、设置与滑出面板；实际点击及 elementFromPoint 命中。
- 标签与图标：全库判重在搜索过滤后保持；符号开头的首字色块；31 个原图仅 DEEIX Chat 和 Google AI Studio 命中反白。
- 探索场景：641px 临界宽度是否溢出；没有分组时新建入口是否可点击；搜索无结果是否保留可用入口。
- 自动验证：类型检查、单测、构建和 JS gzip 预算；隔离数据目录运行 E2E，并检查主路径对已有数据的依赖。

## 结果

- `npm test`：263/263 通过；`npm run build`（含 typecheck）通过。
- 首屏 JS gzip：19.17 + 32.96 = 52.13 kB，低于 80 kB；没有新增依赖。
- 独立 3101 服务、新临时数据目录：27/27 E2E 通过，无重试。
- 同一测试库已有 3 个非默认分组、8 条书签且无「常用」时，连续两遍 `main.spec.ts` 共 8/8 通过，原数据未变；零分组时单独主路径 1/1 通过。
- 桌面面板 x=22、宽约 892.8px、右边界约 914.8px，右侧留白约 525.2px（36.5%）。四张内置壁纸逐张通过设置面板切换并截图，人物面部与主要躯干在右侧清晰呈现。
- 桌面常驻模糊仅 `.launcher`，分组实际排成三列（x≈39/332/625）；单书签分组与其他组并排。新增主按钮、列表末尾虚线入口均符合样稿。
- 手机 390×844：全屏启动器，卡片列宽 118/118/118px，模糊 14px，分组操作常显；首屏及滚动到底部均已截图，主机名截断未撑宽卡片，新建分组可点。
- 641px 临界视口：面板宽 597px，未横向溢出，实际分组降为两列；CSS 的 `column-count: 3` 是上限，不能仅凭该计算属性断言实际列数。
- 搜索、顶栏新增、分组添加/编辑、列表新建、空状态新建均通过实际点击或 `elementFromPoint`；滑出面板在视口右侧，卡片菜单在 body，未被启动器裁切。
- 搜索 `cpa-grok` 后只显示两条相关书签，其中同名项仍显示 `cpa-grok.lucky0625.tech`；无匹配时按既有规则保留 52 条书签和新建入口。
- 31 张快照原图按真实 resize/ensureAlpha 和 `isDarkGlyph` 流程复核，仅命中 DEEIX Chat / Google AI Studio，其余 29 张未命中。页面已上传图标的不透明像素平均亮度均为 255，透明像素分别 2217/2964 个。
- 本轮页面验收未出现 JS 异常；未发现非预期横向溢出、控件遮挡或弹层裁切。验收用浏览器及独立 3101 服务已关闭；Claude 的 3100 预览服务保留，壁纸恢复为 w-01。

截图及结构化指标保存在本地忽略目录 `.playwright-mcp/home-visual-refresh/`：`desktop-w-01.png` 至 `desktop-w-04.png`、`mobile-top.png`、`mobile-bottom.png`、`desktop-641px.png`、`search-duplicate.png`、`menu-desktop.png`、`settings-desktop.png`、`empty-state.png`、`mobile-new-group.png`、`metrics.json`。不把测试运行产物提交进代码仓库。

## 测试污染复盘

1. 根因类别：E（隐含假设）及 D（覆盖缺口）。主路径默认存在分组，空状态测试却删除全部分组；拖拽在仅一条书签时也可能通过。
2. 新建空库只能暂时掩盖污染；单独重跑不能证明整套测试可重复运行。原日志里登录空白页本轮未复现，不能据此断言是机器负载。
3. 修复：主路径自建分组及对照书签、断言完整排序并清理/恢复壁纸；空状态拦截本页 bootstrap，另断言真实服务端数据未变。
4. 验证扩展：全量 E2E、已有数据连续两遍主路径规格、零分组主路径均通过。未把无证据的冷启动重试加入配置。
5. 预防规则已补到 `.trellis/spec/frontend/quality-guidelines.md`。

## 后续边界

本地验收后，用户于 2026-09-28 明确授权推送 main 并部署，发布结果见下。DEEIX Chat 与 Google AI Studio 的旧缓存仍由用户在编辑面板各点一次「重新抓取」更新，没有自动迁移线上图标。

## 生产发布（2026-09-28）

- GitHub：`0401lucky/project-nav` 的 main 已推送应用提交 `cd98205`。
- 服务器：yunyou-9，`64.83.25.9`，SSH 别名 `yoyo-9` / 端口 48734；目录 `/root/apps/nav`；使用 `compose.server.yml`，容器 `nav` 仍绑定 `127.0.0.1:8096`。
- 站点：`https://nav.lucky0625.qzz.io`。发布归档 SHA256 为 `7d1e39f1c86886f5e5da33c866acfdc650949d5a287b4fe4ce5bbbfc624700b9`，镜像 ID 为 `sha256:dfc453c0b24a88bff95c87ff225ab29528228b1871a2b897077cc1431dccc600`。
- 先构建后切换；停站期间备份数据到 `/root/apps/nav-backups/20260928T070624Z-cd98205/data-before.tar.gz`。同目录保存旧源码与配置，旧镜像 tag 为 `personal-bookmark-nav:rollback-20260928T070624Z-cd98205`。
- 切换前后分组、书签、设置、壁纸记录和全部图标文件摘要一致；9 组、52 条书签、31 个图标保留，SQLite integrity_check=ok。密码配置及服务器 Compose 文件摘要一致。
- 容器 healthy / RestartCount=0；本机未登录 bootstrap=401；公网首页及新版 JS/CSS=200。已登录公网浏览器复核桌面 52 张卡片、单模糊层、搜索判重、可点击新增面板和手机三列布局，未出现页面 JS 异常。
- 生产截图与指标在 `.playwright-mcp/nav-deploy/production-desktop.png`、`production-mobile.png` 和 `production-checks.json`。部署机器定位、备份和回滚命令同步到 `D:/code/服务器项目部署与记录/yunyou-9-64.83.25.9.md` 与该目录 README。
