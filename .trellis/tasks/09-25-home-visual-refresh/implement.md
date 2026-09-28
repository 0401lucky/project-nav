# 首页视觉调整 · 执行计划

1. 纯逻辑：新建 `src/composables/labels.ts` 和 `labels.test.ts`（取首字：「lucky API」→ L、「（codex2）CPA Manager Plus」→ C、emoji 或全是符号时返回 ?；`hueOf` 和旧实现结果一致；判重时忽略首尾空白、不区分大小写；`displayHost` 去掉 `www.`、网址解析失败时返回原串）→ `npm test`
2. 服务端反白：`icons.ts` 导出 `isDarkGlyph` 并接进 `encodeIcon`；`icons.test.ts` 补 4 条用例（见 design §7）→ `npm test`；再写一次性脚本，用真实的 `isDarkGlyph` 把 `mockups/icons/` 里的 31 个图标跑一遍，只应命中 DEEIX Chat 和 Google AI Studio
3. 首字色块：`FallbackIcon.vue` 改用 `labels.ts`、换成低饱和配色、`size` 改为可选 → `npm run typecheck`
4. 卡片：`data.ts` 加 `duplicateTitleKeys`；`BookmarkCard.vue` 改成紧凑列表，加 `.card__text` 和 `.card__host`、调整「⋯」按钮、落点线改成横线；`useDrag.overBookmark` 改为按纵向判断 → typecheck
5. 分组：`GroupPanel.vue` 去掉玻璃背景和模糊，改成图标按钮、悬停才显示，保留拖入时的边框反馈，改空分组提示文字 → typecheck
6. 布局与入口：`homeContext.ts` 加 `addGroup`；`BookmarkGrid.vue` 改成多列、加「新建分组」、改空状态；`App.vue` 加 `.launcher`、删掉悬浮按钮；`TopBar.vue` 改主按钮；`tokens.css` 加令牌、换 `--scrim` → typecheck
7. 全量验证：
   - `npm run build`（含 typecheck），统计首屏 JS gzip，要求 < 80KB
   - `npm test`，要求全部通过（原有 242 条加上新增的）
   - `npm run e2e`，要求 27 条全部通过。需要起本地服务，起之前先征得用户同意
   - 浏览器实操：1440×900 下四张壁纸各截一张图，核对人物完整露出、右侧约 1/3 为空；390×844 截图核对 3 列竖排、主机名截断
   - 用 `elementFromPoint` 确认搜索框、「新建分组」、空状态的按钮、分组头图标按钮是最顶层、点得到（spec「存在 ≠ 可点击」）
   - 统计常驻元素里计算样式 `backdrop-filter ≠ none` 的个数，应为 1
8. 更新 spec：前端 `index.md` 和 `component-guidelines.md` 里允许用模糊的容器，把「分组面板 `.panel`」换成「启动器 `.launcher`」，并补上「fixed 定位的弹层不能放进 `.launcher`」这条铁律；后端 `icon-pipeline.md` 的契约、典型情况、必需测试补上反白规则
9. 提交；部署前征得用户同意，按部署记录的流程发布；上线后提醒用户给那 2 个深色图标各点一次「重新抓取」

回滚点：第 1、2 步各自独立；第 3–6 步是同一次界面改版，出问题整体回退；服务端反白（第 2 步）可以单独回退。

## 2026-09-28 接续结果

步骤 1–8 完成，完整结果见 `verification.md`。验收期间发现主路径依赖现存分组、空状态用例删除全库分组的隔离问题，已修复 `e2e/main.spec.ts` 并补点击与数据不变断言。27 条 E2E 全过；非默认已有数据重复运行 8/8，零分组主路径 1/1；单测共 263 条通过，首屏 JS gzip 52.13 kB。步骤 9 的线上发布尚未执行。
