# 首页操作易用性 · 执行计划

1. 提示条支持操作按钮：`useToast.ts` 加 `action()`，改 `Toast.vue` 结构 → `npm run typecheck`
2. 删除撤销：`data.ts` 的 `removeBookmark / undoRemove / flushPendingDeletes`，在重排、删分组、重新拉取、退出登录前 flush；`reset()` 清理 → typecheck
3. 菜单直接选分组：`BookmarkCard.vue` 菜单结构与定位、`homeContext.ts` 改 `move` 签名、`App.vue` 删除移动面板 → typecheck
4. 拖整卡 / 标题栏：`useDrag.ts` 加 `narrow / canDrag`；`BookmarkCard.vue`、`GroupPanel.vue` 去手柄、改 draggable → typecheck
5. 搜索：`filter.ts` 加 `stepIndex` 与单测；`useFilter.ts` 加 `activeIndex / activeBookmark`；`SearchBox.vue` 加方向键、Shift+回车、搜索引擎按钮；卡片 `active` 描边 → `npm test`
6. e2e：`main.spec.ts` 改为拖卡片本体；`mobile.spec.ts` 改为断言卡片不可拖、无手柄；新增 `e2e/interaction.spec.ts` 覆盖撤销删除、到期删除、删除后重排、菜单移分组、↑↓ 回车、Shift+回车与按钮
7. 全量验证：`npm run build`（含 typecheck）→ 统计首屏 JS gzip；本地起服务跑 `npm run e2e`；再用浏览器实操 PRD 每条验收，顺带核对图标任务遗留的 3 条浏览器验收（新增自动带图标、编辑面板重抓、批量补抓统计）
8. 更新 spec：`state-management.md` 写入待删除项与 flush 约定；`component-guidelines.md` 视需要补菜单 / 拖拽约定
9. 提交并推送 main；按部署记录「更新代码」流程部署到 yoyo-9（备份 data、打回滚 tag），线上在 `127.0.0.1:8096` 验证，经用户同意后执行一次批量补抓并记录结果；补写部署记录

回滚点：第 1–5 步各自独立可回退；第 6 步只动测试；部署出问题就用回滚 tag 恢复。
