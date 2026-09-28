# 壁纸扩充验收（2026-09-28）

## 最终素材

- 新增 w-05 银发雪夜、w-06 栗发暖海、w-07 黑发星城、w-08 灰紫夜花；每组横竖各一张。
- 用户否定首轮偏写实、成熟粗犷的人物，明确选择类似《恋与深空》的精致 3D / 半写实乙游方向。首轮 8 张保存在 `.playwright-mcp/wallpaper-expansion/rejected-round1/`，没有接入。
- 最终横版使用 `prompts/otome-w-05.txt` 至 `otome-w-08.txt`，以原有 w-01 / w-02 的实际图片作为质量和布局参考，经 `imagegen-third-party` 的 edit 路径生成。最终竖版再以各自横版作为身份参考，使用 `prompts/portrait.txt`。
- 模型为配置的 `gpt-image-2.5`；有一次连接错误，检查服务恢复后重试成功。原图在 `assets/wallpapers-src/`，未提交；发布产物在 `public/wallpapers/`。
- 主会话和检查代理逐张检查了最终 8 张成图，人物外观和横竖配对一致，未见文字、水印或明显肢体畸形。用户尚未评价重做后的最终成图。

## 接入与自动检查

- 新增 40 个 AVIF/WebP/LQIP 发布文件，共 1,852,910 字节；最大单文件 114,297 字节（111.6KB），低于 300KB。
- 清单共 16 张 / 8 组；原有 8 条记录完全保留，原有 40 个壁纸文件 SHA256 未变。
- README 更新组数；壁纸测试更新总数并加强每组必须一横一竖的断言。
- 壁纸测试 23/23 通过；`npm run build`（含前后端 typecheck）通过；首屏 JS gzip 52.13KB 不变；`git diff --check` 通过。
- 检查代理未发现需修复问题。无新增运行时逻辑、依赖或跨层契约，不需额外修改项目规范。

## 浏览器检查

- 本地 3110 使用独立测试数据目录，包含 9 组 / 52 条样稿快照书签。先建立只有旧 8 张壁纸且选中 `w-03-landscape` 的数据，再启动新版；同步后有 16 张，原选择保留。
- 1440×900：设置里显示 8 个主题；逐一选择 w-05 至 w-08，加载各自横版 AVIF，人物面部位于启动器右侧且可见，无横向溢出。
- 刷新后保留新选择 `w-08-landscape`。
- 390×844：逐一选择四个新主题，均自动加载对应竖版的小档 AVIF；无横向溢出，设置中的 8 个主题可点击。
- 将手机视口旋转为 844×390 后，自动改用同主题横版。
- 没有页面 JS 错误或壁纸资源失败响应；自动化浏览器已关闭，3110 预览服务保留。

## 本地证据与后续

- `.playwright-mcp/wallpaper-expansion/otome-preview.jpg`：四位新版人物预览。
- 同目录 `desktop-w-05.png` 至 `desktop-w-08.png`、`mobile-w-05.png` 至 `mobile-w-08.png`、`picker-desktop.png`、`picker-mobile.png` 和 `browser-report.json`：页面证据。
- `integration-report.json` 与 `baseline.json`：新增产物和旧文件校验。
- 壁纸阶段完成时尚未部署；后续与分组折叠一起发布，见下方续验记录。

## 分组折叠最终检查（2026-09-28）

- 恢复中断任务并核对已有改动；检查代理确认无须继续修改源码。
- `npm test` 266/266；`npm run typecheck`、`npm run build` 通过。
- 在独立目录 `.playwright-mcp/collapse-deploy/review-data-20260928`、端口 3138 运行全量 E2E，36/36 通过。
- 覆盖独立折叠、标题点击、空组、刷新/重开记忆、搜索临时展开与无匹配恢复、键盘/手机、隐藏链接 Tab、拖拽、新增成功/失败和存储异常。
- 之前页面检查发现的跨组菜单残留已在当前代码修正：标题按钮仍冒泡，标题处理器排除按钮；新增回归验证折叠/添加/编辑另一组会关闭菜单。
- 本轮主会话尝试交互式页面复核时，浏览器安全策略阻止生产域名与本地 3110，没有绕过；此前的桌面/手机截图及本轮独立 E2E 是页面证据，本轮不宣称完成人工浏览器复核。
- 前端规范同步折叠偏好、搜索派生展示、存储降级和标题按钮冒泡规则。
- 壁纸提交 `aa7c5ec` 复核：旧 8 条记录及原资产未变，新 40 个产物最大 114,297 字节。

## 生产发布（2026-09-28 晚）

- 已推送 GitHub `0401lucky/project-nav` main，应用版本 `82fcebd`，包含壁纸提交 `aa7c5ec`。
- 服务器 SSH 别名 `yoyo-9`（yunyou-9 / 64.83.25.9），目录 `/root/apps/nav`，继续使用 `compose.server.yml`；容器仍绑定 `127.0.0.1:8096`。
- 站点入口：`https://nav.lucky0625.qzz.io/`。本轮未通过公网浏览器复核；审核明确拒绝该域名和本地 3110，未尝试其他浏览器或旁路访问。
- 发布包 SHA256：`703b9d48c0f770d0585d4d09572fce9a6bb6f5423810d62086ac3c83d80b7d3c`。
- 新镜像：`sha256:d9c82b507e650f19f70108cabc43b209f0424aea21c685df1665663b8059b55d`；`.deployed-revision` 为 `82fcebd`。
- 先构建，再停 nav 备份数据并切换；备份 `/root/apps/nav-backups/20260928T134810Z-82fcebd/` 包含旧源码、配置、镜像信息、数据指纹和 `data-before.tar.gz`（gzip 检查通过）。
- 数据指纹：分组 9、书签 51、图标文件 36，分组/书签/设置/图标/上传壁纸完全不变；内置壁纸仅新增预期 w-05 至 w-08 的 8 行，旧行原样保留，总计 16 张 / 8 组。SQLite integrity_check=ok。
- `.env` 与 `compose.server.yml` SHA256 前后相同；容器 healthy、RestartCount=0，本机未登录 `/api/bootstrap`=401；启动日志显示内置壁纸 16 张，无启动异常。
- 回滚：在 `/root/apps/nav` 执行 `docker tag personal-bookmark-nav:rollback-20260928T134810Z-82fcebd personal-bookmark-nav:latest`，再执行 `docker compose -f compose.server.yml up -d --no-build --no-deps --force-recreate nav`。此镜像回滚不删除新增壁纸记录；如需数据还原，用停机备份另行操作，避免覆盖上线后的用户编辑。
- 本地部署证据保存在 `.playwright-mcp/collapse-deploy/`；服务器部署档案同步更新到 `D:/code/服务器项目部署与记录/`。
